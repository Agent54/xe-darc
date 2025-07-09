let containers
let containerCacheTime = 0
let myPort = 5196

export default {
	async fetch(request, env) {
		const url = new URL(request.url)
		if (Date.now() - containerCacheTime > 20000) {
			containers = null
		}

		if (!containers) {
			containerCacheTime = Date.now()
			console.log("fetching containers")

			const containersRes = await (
				await env.docker.fetch("http://localhost/containers/json")
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
			url.hostname =  containers.all[serviceName].Names[0].replace('/', '')
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
