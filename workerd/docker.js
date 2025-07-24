import { connect } from 'cloudflare:sockets'
let containers
let containerCacheTime = 0
let myPort = 5196

export default {
	async fetch(request, env) {
		const url = new URL(request.url)

		if (url.host === "api.moby.localhost") {
			// Check if this is a TCP upgrade request (Docker socket connection)
			const connection = request.headers.get('connection')
			const upgrade = request.headers.get('upgrade')
			
			if (connection?.toLowerCase().includes('upgrade') && upgrade?.toLowerCase() === 'tcp') {
				console.log('Handling Docker socket TCP upgrade for:', url.pathname)
				
				try {
					// First, try to establish the Docker API session via HTTP
					const upgradeResponse = await env.docker.fetch(url, {
						method: request.method,
						headers: request.headers,
						body: request.body
					})
					
					// If the Docker daemon responds with 101 Switching Protocols, 
					// we need to establish a raw TCP connection
					if (upgradeResponse.status === 101) {
						console.log('Docker daemon confirmed protocol switch, establishing TCP connection')
						
						// Create TCP connection to Docker daemon 
						// Note: The actual host/port should match your Docker daemon configuration
						const dockerSocket = connect({ 
							hostname: 'localhost', // or docker daemon host
							port: 2375 // or 2376 for TLS, or Unix socket port
						})
						
						// Send the HTTP upgrade request over the TCP connection
						const writer = dockerSocket.writable.getWriter()
						const encoder = new TextEncoder()
						
						// Reconstruct the HTTP request
						const httpRequest = `${request.method} ${url.pathname}${url.search} HTTP/1.1\r\n` +
							`Host: ${url.host}\r\n` +
							`Connection: Upgrade\r\n` +
							`Upgrade: tcp\r\n` +
							Array.from(request.headers.entries())
								.filter(([key]) => !['host', 'connection', 'upgrade'].includes(key.toLowerCase()))
								.map(([key, value]) => `${key}: ${value}`)
								.join('\r\n') +
							'\r\n\r\n'
						
						await writer.write(encoder.encode(httpRequest))
						
						// If there's a request body, send it
						if (request.body) {
							const reader = request.body.getReader()
							try {
								while (true) {
									const { done, value } = await reader.read()
									if (done) break
									await writer.write(value)
								}
							} catch (e) {
								console.error('Error streaming request body:', e)
							}
						}
						
						// Return the TCP socket stream as the response
						return new Response(dockerSocket.readable, {
							status: 101,
							statusText: 'Switching Protocols',
							headers: {
								'Connection': 'Upgrade',
								'Upgrade': 'tcp'
							}
						})
					}
					
					// If not a protocol switch, return the regular response
					return upgradeResponse
					
				} catch (error) {
					console.error('Docker TCP upgrade failed:', error)
					return new Response(`Docker socket connection failed: ${error}`, { 
						status: 500,
						headers: { 'Content-Type': 'text/plain' }
					})
				}
			}
			
			// Regular HTTP request to Docker API
			const response = await env.docker.fetch(url, {
				method: request.method,
				headers: request.headers,
				body: request.body
			})

			console.log(request.url)
			console.log(request.method)
			console.log(request.body)
			console.log(request.headers)

			return response
		}
		
		// Handle deploy endpoint
		if (url.pathname === '/deploy' && request.method === 'POST') {
			try {
				const { gitUrl, dockerfilePath } = await request.json();
				
				if (!gitUrl) {
					return new Response(JSON.stringify({ error: 'Git URL is required' }), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				// Basic validation of git URL
				if (!gitUrl.match(/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org)/)) {
					return new Response(JSON.stringify({ 
						error: 'Only GitHub, GitLab, and Bitbucket URLs are supported' 
					}), {
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				console.log(`Deploying Docker container from ${gitUrl} using ${dockerfilePath}`)
				
				// Ensure we have a proper Git clone URL for Docker's remote parameter
				let normalizedGitUrl = gitUrl
				
				// Convert GitHub/GitLab web URLs to proper Git clone URLs
				if (gitUrl.match(/^https?:\/\/(github\.com|gitlab\.com)/)) {
					// Remove trailing slash if present
					normalizedGitUrl = gitUrl.replace(/\/$/, '')
					// Add .git if not already present
					if (!normalizedGitUrl.endsWith('.git')) {
						normalizedGitUrl += '.git'
					}
				}
				
				console.log(`Normalized Git URL for Docker remote: ${normalizedGitUrl}`)
				
				// Generate deployment ID and service name
				const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
				const serviceName = gitUrl.split('/').pop().replace(/\.git$/, '').toLowerCase()
				const projectName = 'darc'
				
				// Build the image using Docker API with Git remote URL instead of tar stream
				const dockerfileName = dockerfilePath || 'Dockerfile'
				const imageTag = `${projectName}_${serviceName}:latest`
				
				console.log('Building Docker image from Git remote URL...')
				
				const buildParams = new URLSearchParams()
				buildParams.append('dockerfile', dockerfileName)
				buildParams.append('t', imageTag)
				buildParams.append('remote', normalizedGitUrl)
				buildParams.append('version', '1')
				
				console.log('Docker build URL:', `http://api.moby.localhost/v1.51/build?${buildParams.toString()}`)
				console.log('Build parameters:', Object.fromEntries(buildParams.entries()))
				
				const buildResponse = await env.docker.fetch(`http://api.moby.localhost/v1.51/build?${buildParams.toString()}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					}
				})

				console.log('Docker build response status:', buildResponse.status)
				console.log('Docker build response headers:', Object.fromEntries(buildResponse.headers.entries()))

				// Read Docker build output once (can't read response body twice!)
				const buildOutput = await buildResponse.text()
				console.log('Docker build output length:', buildOutput.length)

				if (!buildResponse.ok) {
					console.error('Docker build failed with status:', buildResponse.status)
					console.error('Docker build error response:', buildOutput)
					return new Response(JSON.stringify({ 
						error: 'Docker build failed',
						status: buildResponse.status,
						details: buildOutput 
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
				}

				// Parse Docker API v2 build stream output (newline-separated JSON objects)
				let hasError = false
				if (buildOutput) {
					const lines = buildOutput.split('\n').filter(line => line.trim())
					console.log('Docker build lines count:', lines.length)
					
					for (const [index, line] of lines.entries()) {
						if (!line.trim()) continue
						
						try {
							const json = JSON.parse(line)
							console.log(`Build line ${index}:`, json)
							
							// Handle Docker API v2 message types
							if (json.error) {
								console.error('Docker daemon error:', json.error)
								hasError = true
							} else if (json.errorDetail) {
								console.error('Docker daemon error detail:', json.errorDetail)
								hasError = true
							} else if (json.aux) {
								// Base64 decode the aux field for buildkit output
								try {
									const decodedAux = atob(json.aux)
									console.log('Docker build aux (decoded):', decodedAux)
								} catch (decodeError) {
									console.log('Docker build aux (raw):', json.aux)
								}
							} else if (json.stream) {
								console.log('Docker build stream:', json.stream.trim())
							} else if (json.status) {
								console.log('Docker build status:', json.status)
							} else if (json.progress) {
								console.log('Docker build progress:', json.progress)  
							} else {
								console.log('Docker build message:', json)
							}
						} catch (parseError) {
							console.log('Non-JSON build output:', line)
						}
					}
				}

				// If we found errors in the build stream, fail the deployment
				if (hasError) {
					return new Response(JSON.stringify({ 
						error: 'Docker build failed with errors',
						details: buildOutput 
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				
				// Verify the image was created
				console.log(`Verifying image exists: ${imageTag}`)
				
				const imageResponse = await env.docker.fetch(`http://api.moby.localhost/v1.51/images/${imageTag}/json`)
				if (!imageResponse.ok) {
					console.error('Image verification failed:', imageResponse.status, await imageResponse.text())
					return new Response(JSON.stringify({ 
						error: 'Docker build completed but image was not created',
						details: `Image ${imageTag} not found after build. Build output: ${buildOutput}` 
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				const imageInfo = await imageResponse.json()
				console.log('Docker image verified successfully:', imageInfo.Id)
				
				// Create container with compose-style configuration
				const containerConfig = {
					Image: imageTag,
					name: `${projectName}_${serviceName}_1`,
					Labels: {
						'com.docker.compose.project': projectName,
						'com.docker.compose.service': serviceName,
						'com.docker.compose.container-number': '1',
						'darc.deployment.id': deploymentId,
						'darc.deployment.source': gitUrl
					},
					HostConfig: {
						PublishAllPorts: true,
						RestartPolicy: {
							Name: 'unless-stopped'
						}
					},
					NetworkingConfig: {
						EndpointsConfig: {
							[`${projectName}_default`]: {}
						}
					}
				}
				
				console.log('Creating container...', containerConfig)
				
				// Create the container using proper API endpoint
				const createResponse = await env.docker.fetch('http://api.moby.localhost/v1.51/containers/create', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(containerConfig)
				})
				
				if (!createResponse.ok) {
					const createError = await createResponse.text()
					console.error('Container creation failed:', createError)
					return new Response(JSON.stringify({ 
						error: 'Container creation failed',
						details: createError 
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				const createResult = await createResponse.json()
				const containerId = createResult.Id
				
				console.log('Container created:', containerId)
				
				// Start the container using proper API endpoint
				const startResponse = await env.docker.fetch(`http://api.moby.localhost/v1.51/containers/${containerId}/start`, {
					method: 'POST'
				})
				
				if (!startResponse.ok) {
					const startError = await startResponse.text()
					console.error('Container start failed:', startError)
					return new Response(JSON.stringify({ 
						error: 'Container start failed',
						details: startError 
					}), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					})
				}
				
				console.log('Container started successfully')
				
				// Clear container cache to refresh the listing
				containers = null
				
				return new Response(JSON.stringify({
					success: true,
					deploymentId,
					containerId,
					serviceName,
					projectName,
					gitUrl: normalizedGitUrl,
					dockerfilePath,
					status: 'deployed',
					message: `Docker container deployed successfully from ${normalizedGitUrl}`,
					serviceUrl: `http://${serviceName}.localhost:${myPort}`
				}), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
				
			} catch (error) {
				console.error('Docker deployment error:', error)
				return new Response(JSON.stringify({ 
					error: 'Failed to process deployment request',
					details: error.message 
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}
		if (Date.now() - containerCacheTime > 20000) {
			containers = null
		}

		if (!containers) {
			containerCacheTime = Date.now()
			console.log("fetching containers")

			const containersRes = await (
				await env.docker.fetch("http://api.moby.localhost/v1.51/containers/json")
			).json()

			containers = { all: {} }

			containersRes.forEach((container) => {
				container.ports = []
				for (const port of container.Ports) {
					if (port.PublicPort && port.Type === "tcp" && port.IP !== '::') {
						container.ports.push({
							public: port.PublicPort,
							private: port.PrivatePort
						})
					}
				}
				container.ports = container.ports.sort(({ private: a }, { private:b }) => a - b)

				container.project = container.Labels["com.docker.compose.project"]
				container.service = container.Labels["com.docker.compose.service"]
				container.number = container.Labels["com.docker.compose.container-number"]
				// container.cors = container.Labels["cors"]
				if (containers.all[container.service]) {
					container.service = container.service + "_" + container.project
				} 
				if (container.number > 1) {
					container.service = container.service + "_" + container.number
				}

				container.state = container.State
				if (!containers[container.project]) {
					containers[container.project] = []
				}
				containers[container.project].push(container)
				containers.all[container.service] = container
			})

			// console.log(JSON.stringify(containers, null, 2))
		}

		if (url.hostname !== "localhost") {
			const urlParts = url.hostname.split(".")

			let portIndex
			if (urlParts.length === 3) {
				portIndex = Number(urlParts[1])
			} else {
				portIndex = 0
			}
			
			const serviceName = urlParts[0]

			const newRequest = new Request(request)
			newRequest.headers.append('x-forwarded-host', url.host)
			url.hostname = containers.all[serviceName]?.Names[0]?.replace('/', '')
			url.port = containers.all[serviceName]?.ports[portIndex]?.private
			
			const newReq = new Request(url.href, newRequest)

			// if (serviceName === "..." && newReq.method === "OPTIONS") {
			// 	const headers = new Headers()
			// 	headers.set("Access-Control-Allow-Origin", "http://localhost")
			// 	headers.set("Access-Control-Allow-Credentials", "true")
			// 	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
			// 	headers.set(
			// 		"Access-Control-Allow-Headers",
			// 		"DNT,X-CustomHeader,Keep-Alive,User-Agent,X-newResuested-With,If-Modified-Since,Cache-Control,Content-Type,git-protocol,token"
			// 	)
			// 	headers.set("Access-Control-Max-Age", 1728000)
			// 	headers.set("Content-Type", "text/plain charset=UTF-8")
			// 	headers.set("Content-Length", 0)

			// 	return new Response("", { headers, status: 204 })
			// }

			return fetch(newReq)
				.catch(async (err) => {					
					// const log = await env.docker.fetch(`http://localhost/containers/${containers.all[serviceName].Id}/logs?stdout=true&stderr=true`).catch(() => {})
					// if (log) {	
					// 	const reader = log.body.getReader()

					// 	const { readable, writable } = new TransformStream()
					// 	const writer = writable.getWriter()

					// 	const decoder = new TextDecoder()
					
					// 	async function processFeed () {
					// 	while (true) {
					// 		const { done, value } = await reader.read()
					
					// 		console.log('deco:', decoder.decode(value))
					// 		await writer.write(value) // await ?
					
					// 		if (done) {
					// 			if (!readable.locked) {
					// 				await readable.cancel()
					// 			}
						
					// 			await reader.cancel()
						
					// 			break
					// 		}
					// 	}
					// 	}
					
					// 	processFeed()
					// }
		
					containers = null

					const html = `
					<!DOCTYPE html>
					<head>
						<link rel="stylesheet" href="https://matcha.mizu.sh/matcha.css">
						<script>
							setTimeout(() => {
								location.reload()
							}, 10000)
						</script>
					</head>
					<html>
						<body>
							<section>
								<article>
									Error: ${JSON.stringify(err) + ' ' + url.href}
								</article>
							</section>
						</body>
					</html>
					`
					
					return new Response(html, { headers: { "content-type": "text/html" }, status: 500  })
				})
				.then((res) => {
					// if (serviceName === "...") {
					// 	return addCorsHeaders(res)
					// } else {
					return res
				})
		}

		const html = `
<!DOCTYPE html>
<head>
	<link rel="stylesheet" href="https://matcha.mizu.sh/matcha.css">
</head>
<html>
	<body>
		<section>
			${Object.keys(containers)
				.map((project) =>
					project === "all" ? "" : `<h2>${project}</h2>${renderContainers(containers[project])}`
				)
				.join("")}
		</section>
	</body>
</html>
`
		return new Response(html, { headers: { "content-type": "text/html" } })
	},
}

function renderContainers(containers) {
	return `${containers
		.sort((a, b) => b.state - a.state || b.ports.length - a.ports.length)
		.map(
			(container) =>
				`<article><header><h3>${container.service} ${
					container.state === "running" ? "" : "(" + container.state + ")"
				}</h3></header><p>${renderPorts(container)}</p><p>${
					container.cors ? "cors: " + container.cors : ""
				}</p></article>`
		)
		.join("")}`
}

function renderPorts(container) {
	return container.ports.length
		? container.ports.map((port, i) => `<a href="http://${container.service}${i ? '.' + i : ''}.localhost${myPort === 80 ? "" : (":" + myPort)}">${container.service}${i ? '.' + i : ''}.localhost${myPort === 80 ? "" : ":" + myPort}</a> > <a href="http://localhost:${port.public}">localhost:${port.public}</a> > internal:${port.private}`).join('<br>\n')
		: ""
}

// function addCorsHeaders(res) {
// 	const headers = new Headers(res.headers)
// 	headers.set("Access-Control-Allow-Origin", "http://exp.localhost")
// 	headers.set("Access-Control-Allow-Credentials", "true")
// 	headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
// 	headers.set(
// 		"Access-Control-Allow-Headers",
// 		"DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,git-protocol,token"
// 	)
// 	return new Response(res.body, { headers, status: res.status, statusText: res.statusText })
// }
