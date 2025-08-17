<script>
	import { onMount, tick } from 'svelte'
	import RightSidebar from './RightSidebar.svelte'
	import data from '../data.svelte.js'
	import * as smd from 'streaming-markdown'
	import { AgentClient } from 'agents/client'

	let client
	let conv = $state(false)
	async function startVoice() {
		conv = true
	}

	async function stopVoice() {
		conv = false
	}

	// const conversation = await Conversation.startSession({ signedUrl });
	// 	app.get('/signed-url', yourAuthMiddleware, async (req, res) => {
	//   const response = await fetch(
	//     `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
	//     {
	//       method: 'GET',
	//       headers: {
	//         // Requesting a signed url requires your ElevenLabs API key
	//         // Do NOT expose your API key to the client!
	//         'xi-api-key': process.env.XI_API_KEY,
	//       },
	//     }
	//   );
	//   if (!response.ok) {
	//     return res.status(500).send('Failed to get signed URL');
	//   }
	//   const body = await response.json();
	//   res.send(body.signed_url);
	// });

	// // Send messages to the Agent
	// setTimeout(() => {

		// JSON.stringify({
		//   type: "message",
		//   text: "hello world",
		//   timestamp: Date.now(),
		// }),
		//   );
	// }, 1000)


	// setTimeout(()=> {
	//     connection.send(
	//         JSON.stringify(  {
	//             "type": "cf_agent_use_chat_request",
	//             "id": "unique-request-id",
	//             "init": {
	//             "method": "POST",
	//             "headers": {"Content-Type": "application/json"},
	//             "body": "{\"messages\":[{\"id\":\"msg_1\",\"role\":\"user\",\"content\":\"Hello\"}]}"
	//             }
	//         })
	//     )
	//     },2000)
	// setTimeout(()=> {
	//     connection.call('sendMessage', ['test']);
	// })

	let {
		onClose,
		openSidebars,
		switchToResources,
		switchToSettings,
		switchToUserMods,
		switchToActivity,
		switchToAIAgent,
		viewMode = 'default',
		currentTab = null
	} = $props()

	let selectedTarget = $state('')
	let conversation = $state('')
	let isProcessing = $state(false)
	let chatHistory = $state([])
	let selectedModel = $state('claude-3-5-haiku-20241022')
	let hoveredMessageId = $state(null)
	let currentTimeout = null
	let currentStreamingMessage = $state(null)
	let messageQueue = $state([])
	let queuePaused = $state(false)
	let chatHistoryList = $state([])
	let editingMessageId = $state(null)
	let editingContent = $state('')
	let isMarkdownStreaming = $state(false)
	let selectedHistoryId = $state('current')

	// Model configurations with proper names and IDs
	const models = [
		{
			name: 'Claude Haiku',
			id: 'claude-3-5-haiku-20241022',
            avatarTitle: 'H',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Simple Icons by Simple Icons Collaborators - https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md --><path fill="currentColor" d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z"/></svg>
			`
		},
		{
			name: 'Claude Sonnet',
			id: 'claude-4-sonnet-20250514',
            avatarTitle: 'S',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Simple Icons by Simple Icons Collaborators - https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md --><path fill="currentColor" d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z"/></svg>
			`
		},
		{
			name: 'Claude Opus',
			id: 'claude-4-opus-20250514',
            avatarTitle: 'O',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Simple Icons by Simple Icons Collaborators - https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md --><path fill="currentColor" d="m4.714 15.956l4.718-2.648l.079-.23l-.08-.128h-.23l-.79-.048l-2.695-.073l-2.337-.097l-2.265-.122l-.57-.121l-.535-.704l.055-.353l.48-.321l.685.06l1.518.104l2.277.157l1.651.098l2.447.255h.389l.054-.158l-.133-.097l-.103-.098l-2.356-1.596l-2.55-1.688l-1.336-.972l-.722-.491L2 6.223l-.158-1.008l.656-.722l.88.06l.224.061l.893.686l1.906 1.476l2.49 1.833l.364.304l.146-.104l.018-.072l-.164-.274l-1.354-2.446l-1.445-2.49l-.644-1.032l-.17-.619a3 3 0 0 1-.103-.729L6.287.133L6.7 0l.995.134l.42.364l.619 1.415L9.735 4.14l1.555 3.03l.455.898l.243.832l.09.255h.159V9.01l.127-1.706l.237-2.095l.23-2.695l.08-.76l.376-.91l.747-.492l.583.28l.48.685l-.067.444l-.286 1.851l-.558 2.903l-.365 1.942h.213l.243-.242l.983-1.306l1.652-2.064l.728-.82l.85-.904l.547-.431h1.032l.759 1.129l-.34 1.166l-1.063 1.347l-.88 1.142l-1.263 1.7l-.79 1.36l.074.11l.188-.02l2.853-.606l1.542-.28l1.84-.315l.832.388l.09.395l-.327.807l-1.967.486l-2.307.462l-3.436.813l-.043.03l.049.061l1.548.146l.662.036h1.62l3.018.225l.79.522l.473.638l-.08.485l-1.213.62l-1.64-.389l-3.825-.91l-1.31-.329h-.183v.11l1.093 1.068l2.003 1.81l2.508 2.33l.127.578l-.321.455l-.34-.049l-2.204-1.657l-.85-.747l-1.925-1.62h-.127v.17l.443.649l2.343 3.521l.122 1.08l-.17.353l-.607.213l-.668-.122l-1.372-1.924l-1.415-2.168l-1.141-1.943l-.14.08l-.674 7.254l-.316.37l-.728.28l-.607-.461l-.322-.747l.322-1.476l.388-1.924l.316-1.53l.285-1.9l.17-.632l-.012-.042l-.14.018l-1.432 1.967l-2.18 2.945l-1.724 1.845l-.413.164l-.716-.37l.066-.662l.401-.589l2.386-3.036l1.439-1.882l.929-1.086l-.006-.158h-.055L4.138 18.56l-1.13.146l-.485-.456l.06-.746l.231-.243l1.907-1.312Z"/></svg>
			`
		},
		{
			name: 'OpenAI O3',
			id: 'openai-o3',
			icon: `
				<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
					<path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z"/>
				</svg>
			`
		},
		
		{
			name: 'Mark (ElevenLabs)',
			id: 'elevenlabs-mark',
			avatarTitle: 'M',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="#3b82f6" viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="#3b82f6"/>
				<path d="M348 292H408V584H348V292Z" fill="#3b82f6"/>
				</svg>
			`
		},
		{
			name: 'River (ElevenLabs)',
			id: 'elevenlabs-dana',
			avatarTitle: 'D',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="#ec4899" viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="#ec4899"/>
				<path d="M348 292H408V584H348V292Z" fill="#ec4899"/>
				</svg>
			`
		},
		{
			name: 'River (ElevenLabs)',
			id: 'elevenlabs-river-slow',
			avatarTitle: 'Rs',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="#ec4899" viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="#ec4899"/>
				<path d="M348 292H408V584H348V292Z" fill="#ec4899"/>
				</svg>
			`
		},
		{
			name: 'River (ElevenLabs)',
			id: 'elevenlabs-river-fast',
			avatarTitle: 'Rf',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="#ec4899" viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="#ec4899"/>
				<path d="M348 292H408V584H348V292Z" fill="#ec4899"/>
				</svg>
			`
		},
		{
			name: 'River (ElevenLabs)',
			id: 'elevenlabs-river',
			avatarTitle: 'R',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="#ec4899" viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="#ec4899"/>
				<path d="M348 292H408V584H348V292Z" fill="#ec4899"/>
				</svg>
			`
		},
		{
			name: 'ElevenLabs Voice',
			id: 'elevenlabs-voice',
			icon: `
				<svg xmlns="http://www.w3.org/2000/svg" width="940" height="940" color="white"viewBox="100 100 680 680" fill="none">
				<path d="M468 292H528V584H468V292Z" fill="white"/>
				<path d="M348 292H408V584H348V292Z" fill="white"/>
				</svg>
			`
		}
	]

	// Function to parse XML tags and determine model
	function parseVoiceContent(content) {
		// Check for <mark>...</mark> tags
		const markMatch = content.match(/<mark>(.*?)<\/mark>/s)
		if (markMatch) {
			return {
				model: 'elevenlabs-mark',
				cleanContent: markMatch[1]
			}
		}
		
		// Check for <dana>...</dana> tags
		const danaMatch = content.match(/<dana>(.*?)<\/dana>/s)
		if (danaMatch) {
			return {
				model: 'elevenlabs-dana',
				cleanContent: danaMatch[1]
			}
		}
		
		// Check for <riverslow>...</riverslow> tags
		const riverslowMatch = content.match(/<river_slow>(.*?)<\/river_slow>/s)
		if (riverslowMatch) {
			return {
				model: 'elevenlabs-river-slow',
				cleanContent: riverslowMatch[1]
			}
		}
		
		// Check for <riverfast>...</riverfast> tags
		const riverfastMatch = content.match(/<river_fast>(.*?)<\/river_fast>/s)
		if (riverfastMatch) {
			return {
				model: 'elevenlabs-river-fast',
				cleanContent: riverfastMatch[1]
			}
		}
		
		// Check for <river>...</river> tags
		const riverMatch = content.match(/<river>(.*?)<\/river>/s)
		if (riverMatch) {
			return {
				model: 'elevenlabs-river',
				cleanContent: riverMatch[1]
			}
		}
		
		// No XML tags found, return original content with default voice model
		return {
			model: 'elevenlabs-voice',
			cleanContent: content
		}
	}

	// Streaming markdown state
	let streamingRenderer = $state(null)
	let streamingParser = $state(null)
	let streamingElement = $state(null)
	
	// Add state for tracking active streams
	let activeStreams = $state(new Map()) // messageId -> { message, parser, renderer, element }
	
	// Track known message IDs to avoid duplicates
	let knownMessageIds = $state(new Set())

	function initializeStreamingMarkdown(element) {
		if (!element) return null

		const renderer = smd.default_renderer(element)
		const parser = smd.parser(renderer)

		return { renderer, parser }
	}

	function initializeNonStreamingMessage(messageId, content) {
		// Find the streaming element for this message
		const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
		if (!messageElement) return

		const contentElement = messageElement.querySelector('.agent-markdown-streaming')
		if (!contentElement) return

		// Initialize streaming markdown and render the content immediately
		const { renderer, parser } = initializeStreamingMarkdown(contentElement)
		if (parser && content) {
			smd.parser_write(parser, content)
			smd.parser_end(parser)
		}
	}

	function startMarkdownStream(messageId) {
		// Find the streaming element for this message
		const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
		if (!messageElement) return null

		const contentElement = messageElement.querySelector('.agent-markdown-streaming')
		if (!contentElement) return null

		const { renderer, parser } = initializeStreamingMarkdown(contentElement)

		return { renderer, parser, element: contentElement }
	}

	function writeMarkdownChunk(parser, chunk) {
		if (parser) {
			smd.parser_write(parser, chunk)
		}
	}

	function endMarkdownStream(parser) {
		if (parser) {
			smd.parser_end(parser)
		}
	}

	function handleModelChange(event) {
		console.log('Model changed to:', event.target.value)
		selectedModel = event.target.value
		localStorage.setItem('selectedModel', selectedModel)
	}

	async function handleStreamingChunk(data, { type } = {}) {
		try {
			console.log('handleStreamingChunk called with data:', data)
			const messageId = data.id
			const body = data.body
			
			// Handle completion message (e:)
			if (type === 'completion' || body.startsWith('e:')) {
				console.log('🏁 COMPLETION MESSAGE - messageId:', messageId)
				const stream = activeStreams.get(messageId)
				if (stream) {
					// End the stream
					endMarkdownStream(stream.parser)
					stream.message.streaming = false
					
					// Mark the final message as a complete server message
					// This helps prevent duplicates when server sends complete message updates
					stream.message.isServerMessage = true
					
					// Remove from active streams
					activeStreams.delete(messageId)
					console.log('🗑️ STREAM REMOVED - activeStreams=' + activeStreams.size)
					
					// Update chat history
					chatHistory = [...chatHistory]
					
					// Clear global streaming state if this was the last stream
					if (activeStreams.size === 0) {
						isMarkdownStreaming = false
						currentStreamingMessage = null
						streamingParser = null
						streamingRenderer = null
						streamingElement = null
						isProcessing = false
						console.log('✅ STREAMING COMPLETE - isProcessing=false isMarkdownStreaming=false')
					}
				}
				return
			}
			
			// Parse the streaming message format: { "body": "0:\" content here\"\n", "done": false, "id": "xxx", "type": "cf_agent_use_chat_response" }
			// Extract content after "0:" and parse as JSON
			const contentStart = body.indexOf('0:') + 2
			const contentPart = body.substring(contentStart)
			
			// Parse the JSON-encoded content
			let content = ''
			try {
				content = JSON.parse(contentPart.trim())
			} catch (parseError) {
				// If parsing fails, use the raw content
				content = contentPart.trim()
			}
			
			// Skip if there's no actual content
			if (!content || content.trim() === '') {
				console.log('Skipping empty content chunk for messageId:', messageId)
				return
			}
			
			// Check if this is the first chunk for this message
			if (!activeStreams.has(messageId)) {
				// Create new streaming message - ALL messages use streaming markdown now
				const streamingMessageId = Date.now().toString()
				const streamingMessage = {
					id: streamingMessageId,
					role: type === 'assistant-doc' ? 'assistant-doc' : 'assistant',
					content: '',
					rawContent: '',
					timestamp: new Date().toISOString(),
					streaming: true,
					sourceMessageId: messageId,
					model: selectedModel
				}

				// Add to chat history
				chatHistory = [...chatHistory, streamingMessage]
				currentStreamingMessage = streamingMessage
				
				// Track this message as known
				knownMessageIds.add(streamingMessageId)

				// Wait for Svelte to update the DOM, then initialize streaming
				await tick()
				
				const streamingSetup = startMarkdownStream(streamingMessageId)
				if (streamingSetup) {
					activeStreams.set(messageId, {
						message: streamingMessage,
						parser: streamingSetup.parser,
						renderer: streamingSetup.renderer,
						element: streamingSetup.element
					})
					
					// Set global streaming state for first stream
					if (activeStreams.size === 1) {
						isMarkdownStreaming = true
						streamingParser = streamingSetup.parser
						streamingRenderer = streamingSetup.renderer
						streamingElement = streamingSetup.element
						console.log('📝 STREAMING START - activeStreams=' + activeStreams.size + ' isMarkdownStreaming=true')
					}
				} else {
					console.warn('Failed to initialize streaming for messageId:', messageId)
				}
			}

			// Get the active stream
			const stream = activeStreams.get(messageId)
			if (stream && content) {
				// Add content to the message
				stream.message.rawContent += content
				
				// Check if we should switch from chat bubble to document style
				const lineCount = (stream.message.rawContent.match(/\n/g) || []).length + 1
				if (lineCount > 16 && stream.message.role === 'assistant') {
					// Switch to document style
					stream.message.role = 'assistant-doc'
					// Update the message in chat history
					const messageIndex = chatHistory.findIndex(m => m.id === stream.message.id)
					if (messageIndex !== -1) {
						chatHistory[messageIndex] = { ...stream.message }
					}
				}
				
				// Write to streaming parser
				writeMarkdownChunk(stream.parser, content)
				
				// Update chat history to trigger reactivity
				chatHistory = [...chatHistory]
			}

			// Old completion detection removed - now handled by 'e:' messages above
			
		} catch (error) {
			console.error('Error parsing streaming message:', error)
			
			// Clean up any hanging streams on error
			const messageId = data.id
			if (activeStreams.has(messageId)) {
				const stream = activeStreams.get(messageId)
				if (stream) {
					endMarkdownStream(stream.parser)
					stream.message.streaming = false
				}
				activeStreams.delete(messageId)
			}
			
			// Reset processing state if no streams remain
			if (activeStreams.size === 0) {
				isMarkdownStreaming = false
				currentStreamingMessage = null
				streamingParser = null
				streamingRenderer = null
				streamingElement = null
				isProcessing = false
				console.log('⚠️ ERROR CLEANUP - isProcessing=false (streaming error)')
			}
			
			// Fall back to regular message display
			const assistantMessageId = (Date.now() + 1).toString()
			const errorMessage = {
				id: assistantMessageId,
				role: 'assistant',
				content: `Error parsing stream: ${data.body}`,
				timestamp: new Date().toISOString()
			}
			
			chatHistory = [...chatHistory, errorMessage]
			knownMessageIds.add(assistantMessageId)
		}
	}

	function handleToolCall(data) {
		try {
			// Parse the tool call format: { "body": "9:{\"toolCallId\":\"toolu_01V5FvBnDEuQWSMgHjsXi1fr\",\"toolName\":\"getWeatherInformation\",\"args\":{\"city\":\"Tallinn\"}}\n", ... }
			const body = data.body
			
			// Extract content after "9:" and parse as JSON
			const contentStart = body.indexOf('9:') + 2
			const contentPart = body.substring(contentStart)
			
			// Parse the JSON-encoded content
			const toolCallData = JSON.parse(contentPart.trim())
			
			console.log('Tool call received:', toolCallData)
			
			// Assume all tool calls might need permission initially
			// We'll determine this based on the response format later
			const toolCard = {
				type: 'tool',
				action: 'tool-call',
				status: 'processing',
				title: toolCallData.toolName,
				details: formatToolArgs(toolCallData.args),
				toolCallId: toolCallData.toolCallId,
				toolArgs: toolCallData.args, // Store original args for easy access
				needsPermission: true, // Start as true, will be updated based on response
				awaitingPermission: true // Track that we're waiting to see what kind of response this gets
			}
			
			// Add tool call card to chat history
			const toolCardMessage = {
				id: Date.now().toString(),
				role: 'info-cards',
				cards: [toolCard],
				timestamp: new Date().toISOString()
			}
			
			chatHistory = [...chatHistory, toolCardMessage]
			knownMessageIds.add(toolCardMessage.id)
			
		} catch (error) {
			console.error('Error parsing tool call:', error)
		}
	}

	function handleToolResult(data) {
		try {
			// Parse the tool result format: { "body": "a:{\"toolCallId\":\"toolu_01M2WQV8xT3dN2wTYXMTbMMC\",\"result\":\"10am\"}\n", ... }
			const body = data.body
			
			// Extract content after "a:" and parse as JSON
			const contentStart = body.indexOf('a:') + 2
			const contentPart = body.substring(contentStart)
			
			// Parse the JSON-encoded content
			const toolResultData = JSON.parse(contentPart.trim())
			
			console.log('Tool result received via a: message:', toolResultData)
			
			// If we get an "a:" message, this tool does NOT require permission
			// Tools that require permission don't get "a:" messages, they get handled via complete message payload
			
			// Find the corresponding tool call card and update it
			const updatedHistory = chatHistory.map(message => {
				if (message.role === 'info-cards') {
					const updatedCards = message.cards.map(card => {
						if (card.toolCallId === toolResultData.toolCallId) {
							// This tool doesn't need permission since it got a direct result
							return {
								...card,
								status: 'accessed',
								needsPermission: false,
								awaitingPermission: false,
								result: toolResultData.result,
								details: card.details + '\n\nResult: ' + JSON.stringify(toolResultData.result, null, 2)
							}
						}
						return card
					})
					return { ...message, cards: updatedCards }
				}
				return message
			})
			
			chatHistory = updatedHistory
			
		} catch (error) {
			console.error('Error parsing tool result:', error)
		}
	}

	function formatToolArgs(args) {
		if (!args || typeof args !== 'object') return ''
		
		// Format args as readable JSON with proper indentation
		return JSON.stringify(args, null, 2)
	}

	function handleResponseSummary(data) {
		try {
			// Parse the response summary format: { "body": "d:{\"finishReason\":\"stop\",\"usage\":{\"promptTokens\":1288,\"completionTokens\":89}}\n", ... }
			const body = data.body
			
			// Extract content after "d:" and parse as JSON
			const contentStart = body.indexOf('d:') + 2
			const contentPart = body.substring(contentStart)
			
			// Parse the JSON-encoded content
			const summaryData = JSON.parse(contentPart.trim())
			
			console.log('Response summary received:', summaryData)
			
			// Add response summary divider
			const responseDividerMessage = {
				id: Date.now().toString(),
				role: 'response-divider',
				content: `${summaryData.usage.promptTokens} prompt • ${summaryData.usage.completionTokens} completion`,
				usage: summaryData.usage,
				timestamp: new Date().toISOString()
			}
			
			chatHistory = [...chatHistory, responseDividerMessage]
			knownMessageIds.add(responseDividerMessage.id)
			
			// Ensure processing is stopped when we get the response summary
			// This acts as a fallback in case streaming completion wasn't detected properly
			setTimeout(() => {
				if (activeStreams.size === 0 && isProcessing) {
					isProcessing = false
					isMarkdownStreaming = false
					currentStreamingMessage = null
					streamingParser = null
					streamingRenderer = null
					streamingElement = null
					console.log('📊 RESPONSE SUMMARY FALLBACK - isProcessing=false')
				}
			}, 100)
			
		} catch (error) {
			console.error('Error parsing response summary:', error)
		}
	}

	function handleChatMessages(data) {
		try {
			const messages = data.messages || []
			console.log('Handling chat messages:', messages)
			
			// Find messages that are truly new (not already in chat history)
			const newMessages = []
			
			for (const message of messages) {
				// Skip if we've already processed this message ID
				if (message.id && knownMessageIds.has(message.id)) {
					console.log('⏭️ Skipping known message ID:', message.id)
					continue
				}
				
				// Handle potential conflicts with active streams
				if (message.role === 'assistant' && activeStreams.size > 0) {
					const conflictingStream = Array.from(activeStreams.entries()).find(([streamId, stream]) => {
						// Check if this server message might be the complete version of a streaming message
						return stream.message.rawContent && message.content &&
							stream.message.rawContent.includes(message.content.substring(0, 50))
					})
					
					if (conflictingStream) {
						const [streamId, stream] = conflictingStream
						console.log('🔄 Found conflicting stream, checking if server message is complete...')
						
						// If server message is significantly longer than streaming content, 
						// it might be a complete replacement
						if (message.content.length > stream.message.rawContent.length * 1.5) {
							console.log('📝 Server message is complete, replacing streaming message')
							
							// Stop the stream and replace with server message
							endMarkdownStream(stream.parser)
							activeStreams.delete(streamId)
							
							// Remove the streaming message from chat history
							chatHistory = chatHistory.filter(msg => msg.id !== stream.message.id)
							
							// Don't skip this message - process it as a replacement
						} else {
							console.log('⏭️ Skipping message that conflicts with active stream:', message.id)
							continue
						}
					}
				}
				
				// Skip if this message content already exists in chat history
				// (handles case where local message gets server ID later)
				const isDuplicate = chatHistory.some(existing => {
					// Exact content match with same role
					if (existing.content === message.content && existing.role === message.role) {
						// Check if timestamps are close (within 5 seconds)
						const timeDiff = Math.abs(new Date(existing.timestamp).getTime() - new Date(message.createdAt).getTime())
						if (timeDiff < 5000) {
							console.log('⏭️ Skipping duplicate content message:', message.id)
							return true
						}
					}
					
					// Check if this is a streaming message that might be replaced by server message
					if (existing.streaming && existing.role === 'assistant' && message.role === 'assistant') {
						// If existing message is streaming and has similar content, it might be a duplicate
						const contentSimilarity = existing.rawContent && message.content && 
							existing.rawContent.includes(message.content.substring(0, 50))
						if (contentSimilarity) {
							console.log('⏭️ Skipping message similar to streaming content:', message.id)
							return true
						}
					}
					
					return false
				})
				
				if (!isDuplicate) {
					newMessages.push(message)
					knownMessageIds.add(message.id)
				}
			}
			
			// Only process truly new messages
			for (const message of newMessages) {
				console.log('Processing new message:', message)
				
				// Convert the message to our internal format
				const internalMessage = {
					id: message.id,
					role: message.role,
					content: message.content,
					timestamp: message.createdAt || new Date().toISOString(),
					streaming: false,
					isServerMessage: true,
					model: selectedModel
				}
				
				// Handle tool invocations if present
				if (message.toolInvocations && message.toolInvocations.length > 0) {
					// Process each tool invocation
					for (const invocation of message.toolInvocations) {
						// Check if this is a permission request based on the result format
						const isPermissionResult = invocation.result === 'No, denied.' || 
												   invocation.result === 'Yes, confirmed.' ||
												   (invocation.result && typeof invocation.result === 'string' && 
												    (invocation.result.includes('denied') || invocation.result.includes('confirmed')))
						
						if (isPermissionResult) {
							// This is a tool that required permission - update existing card if it exists
							const isApproved = invocation.result === 'Yes, confirmed.' || 
											  (invocation.result && invocation.result.includes('confirmed'))
							
							// Try to find existing card and update it
							const updatedHistory = chatHistory.map(msg => {
								if (msg.role === 'info-cards') {
									const updatedCards = msg.cards.map(card => {
										if (card.toolCallId === invocation.toolCallId) {
											return {
												...card,
												status: isApproved ? 'approved' : 'denied',
												needsPermission: true,
												awaitingPermission: false,
												permissionResult: invocation.result
											}
										}
										return card
									})
									return { ...msg, cards: updatedCards }
								}
								return msg
							})
							
							// Check if we found and updated an existing card
							const cardFound = updatedHistory.some(msg => 
								msg.role === 'info-cards' && 
								msg.cards.some(card => card.toolCallId === invocation.toolCallId)
							)
							
							if (cardFound) {
								chatHistory = updatedHistory
							} else {
								// Create new card for this permission result
								const toolCard = {
									type: 'tool',
									action: 'tool-call',
									status: isApproved ? 'approved' : 'denied',
									title: invocation.toolName,
									details: formatToolInvocationDetails(invocation),
									toolCallId: invocation.toolCallId,
									toolArgs: invocation.args, // Store original args for easy access
									needsPermission: true,
									awaitingPermission: false,
									permissionResult: invocation.result
								}
								
								const toolCardMessage = {
									id: `tool-${message.id}-${invocation.toolCallId}`,
									role: 'info-cards',
									cards: [toolCard],
									timestamp: new Date().toISOString()
								}
								
								chatHistory = [...chatHistory, toolCardMessage]
								knownMessageIds.add(toolCardMessage.id)
							}
						}
						// For non-permission results, we don't create cards here since they'll be handled by "a:" messages
					}
				}
				
				// Add the message to chat history
				chatHistory = [...chatHistory, internalMessage]
			}
			
			// Safeguard: Don't accidentally clear history
			if (newMessages.length === 0 && messages.length > 0) {
				console.log('⚠️ No new messages found but server sent messages - possible duplicate detection')
			}
			
			// Update current chat timestamp if we have new messages
			if (newMessages.length > 0) {
				updateCurrentChatTimestamp()
			}
			
		} catch (error) {
			console.error('Error handling chat messages:', error)
		}
	}

	function formatToolInvocationDetails(invocation) {
		const details = []
		
		if (invocation.args) {
			details.push(`Args: ${JSON.stringify(invocation.args, null, 2)}`)
		}
		
		if (invocation.result) {
			details.push(`Result: ${JSON.stringify(invocation.result, null, 2)}`)
		}
		
		return details.join('\n\n')
	}

	// Get available targets with actual names in brackets
	let availableTargets = $derived.by(() => {
		const currentTabTitle = currentTab ? currentTab.title || currentTab.url || 'Untitled Tab' : 'No active tab'
		const currentSpaceName = data.spaceMeta.activeSpace
			? data.spaces[data.spaceMeta.activeSpace]?.name || 'Unnamed Space'
			: 'No active space'

		return [
			{
				id: 'current-tab',
				name: `Current Tab [${currentTabTitle}]`,
				type: 'current-tab',
				description: currentTab ? currentTab.url || 'No URL' : 'No active tab'
			},
			{
				id: 'current-space',
				name: `Current Space [${currentSpaceName}]`,
				type: 'current-space',
				description: data.spaceMeta.activeSpace
					? `${data.spaces[data.spaceMeta.activeSpace]?.tabs?.length || 0} tabs`
					: 'No active space'
			},
			{
				id: 'all-spaces',
				name: `All Spaces [${Object.keys(data.spaces).length} spaces]`,
				type: 'all-spaces',
				description: 'Access all workspaces'
			}
		]
	})

	// Auto-select current target based on view mode
	$effect(() => {
		if (viewMode === 'canvas') {
			selectedTarget = 'current-space'
		} else {
			selectedTarget = 'current-tab'
		}
	})

	// Context metadata gathering function
	function gatherContextMetadata(selectedTarget) {
		const context = {
			type: selectedTarget,
			timestamp: new Date().toISOString()
		}

		if (selectedTarget === 'current-tab' && currentTab) {
			context.currentTab = {
				id: currentTab.id,
				url: currentTab.url,
				title: currentTab.title || 'Untitled Tab',
				favicon: currentTab.favicon
			}
		} else if (selectedTarget === 'current-space' && data.spaceMeta.activeSpace) {
			const activeSpace = data.spaces[data.spaceMeta.activeSpace]
			context.currentSpace = {
				id: data.spaceMeta.activeSpace,
				name: activeSpace?.name || 'Unnamed Space',
				tabs: activeSpace?.tabs?.map(tab => ({
					id: tab.id,
					url: tab.url,
					title: tab.title || 'Untitled Tab'
				})) || []
			}
		} else if (selectedTarget === 'all-spaces') {
			context.allSpaces = Object.entries(data.spaces).map(([spaceId, space]) => ({
				id: spaceId,
				name: space.name || 'Unnamed Space',
				tabCount: space.tabs?.length || 0,
				tabs: space.tabs?.map(tab => ({
					id: tab.id,
					url: tab.url,
					title: tab.title || 'Untitled Tab'
				})) || []
			}))
			context.currentSpaceId = data.spaceMeta.activeSpace
		}

		return context
	}

	// Keep selectedHistoryId in sync with current state
	$effect(() => {
		if (currentChatId) {
			selectedHistoryId = currentChatId
		} else {
			selectedHistoryId = 'current'
		}
	})

	function handleKeyDown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault()
			sendMessage()
		}
	}

	async function sendMessage() {
		if (!conversation.trim()) return

		const userMessage = conversation.trim()
		conversation = ''

		// Check for test commands
		if (userMessage.toLowerCase() === 'cards') {
			handleTestCards()
			const input = document.querySelector('.agent-conversation-input')
			if (input) input.focus()
			return
		}

		if (userMessage.toLowerCase() === 'doc') {
			handleTestDoc()
			const input = document.querySelector('.agent-conversation-input')
			if (input) input.focus()
			return
		}

		if (userMessage.toLowerCase() === 'test') {
			handleTestMessage()
			const input = document.querySelector('.agent-conversation-input')
			if (input) input.focus()
			return
		}

		// Add message to queue
		const queueItem = {
			id: Date.now().toString(),
			userMessage,
			selectedTarget,
			selectedModel,
			timestamp: new Date().toISOString(),
			status: 'queued', // queued, processing, completed
			paused: false // Add paused state for individual items
		}

		messageQueue = [...messageQueue, queueItem]

		// Process queue if not already processing
		if (!isProcessing) {
			processQueue()
		}

		// Re-focus input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	async function processQueue() {
		if (queuePaused || messageQueue.length === 0) return

		isProcessing = true
		console.log('🔄 PROCESSING START - isProcessing=true')

		while (messageQueue.length > 0 && !queuePaused) {
			// Find first unpaused item
			const queueIndex = messageQueue.findIndex((item) => item.status === 'queued' && !item.paused)
			if (queueIndex === -1) {
				// No unpaused items, wait or break
				break
			}

			const queueItem = messageQueue[queueIndex]
			queueItem.status = 'processing'
			messageQueue = [...messageQueue]

			const processingResult = await processMessage(queueItem)

			// Remove processed item from queue (regardless of result)
			messageQueue = messageQueue.filter((item) => item.id !== queueItem.id)

			// If processing was cancelled, break
			if (!processingResult) {
				break
			}
		}

		// Keep isProcessing = true until streaming actually completes
		// Don't set it to false here - let handleStreamingChunk handle it
	}

	async function processMessage(queueItem) {
		// Add user message to history
		const messageId = queueItem.id
		const userMessage = {
			id: messageId,
			role: 'user',
			content: queueItem.userMessage,
			timestamp: queueItem.timestamp,
			model: queueItem.selectedModel
		}
		
		chatHistory = [...chatHistory, userMessage]
		
		// Track this message as known
		knownMessageIds.add(messageId)

		// Gather context metadata based on selected target
		const contextMetadata = gatherContextMetadata(queueItem.selectedTarget)

        client.send(
			JSON.stringify(
				{
					id: crypto.randomUUID(),
					init: {
						body: JSON.stringify({
							id: crypto.randomUUID(),
							messages: [
								{
									id: crypto.randomUUID(),
									createdAt: new Date().toISOString(),
									role: 'user',
									content: queueItem.userMessage,
									model: queueItem.selectedModel,
									parts: [{ type: 'text', text: 'user context: ' + JSON.stringify(contextMetadata) + '\n\n' }, { type: 'text', text: queueItem.userMessage }]
								}
							]
						}),
						headers: { 'Content-Type': 'application/json' },
						method: 'POST'
					},
					type: 'cf_agent_use_chat_request',
					url: '/api/chat'
				}
			)
		)

		// Set a fallback timeout to ensure isProcessing doesn't get stuck
		const fallbackTimeout = setTimeout(() => {
			if (isProcessing && activeStreams.size === 0) {
				isProcessing = false
				isMarkdownStreaming = false
				currentStreamingMessage = null
				streamingParser = null
				streamingRenderer = null
				streamingElement = null
				console.log('⏰ FALLBACK TIMEOUT - isProcessing=false (15s timeout)')
			}
		}, 15000) // 15 second fallback

		try {
			// Add info cards showing what the agent is accessing/doing
			// const selectedTargetObj = availableTargets.find((t) => t.id === queueItem.selectedTarget)
			// const infoCards = []

			// Show context access
			// if (queueItem.selectedTarget === 'current-tab' && currentTab) {
			// 	infoCards.push({
			// 		type: 'context',
			// 		action: 'read-tab',
			// 		status: 'accessed',
			// 		title: currentTab.title || 'Untitled Tab',
			// 		url: currentTab.url,
			// 		favicon: currentTab.favicon || null
			// 	})
			// } else if (queueItem.selectedTarget === 'current-space') {
			// 	const spaceName = data.spaceMeta.activeSpace
			// 		? data.spaces[data.spaceMeta.activeSpace]?.name || 'Unnamed Space'
			// 		: 'No active space'
			// 	const tabCount = data.spaces[data.spaceMeta.activeSpace]?.tabs?.length || 0
			// 	infoCards.push({
			// 		type: 'context',
			// 		action: 'read-space',
			// 		status: 'accessed',
			// 		title: spaceName,
			// 		details: `${tabCount} tabs`
			// 	})
			// } else if (queueItem.selectedTarget === 'all-spaces') {
			// 	infoCards.push({
			// 		type: 'context',
			// 		action: 'read-all-spaces',
			// 		status: 'accessed',
			// 		title: 'All Spaces',
			// 		details: `${Object.keys(data.spaces).length} spaces`
			// 	})
			// }



			// Add info cards to chat history
			// if (infoCards.length > 0) {
			// 	const infoCardsMessage = {
			// 		id: Date.now().toString(),
			// 		role: 'info-cards',
			// 		cards: infoCards,
			// 		timestamp: new Date().toISOString()
			// 	}
			// 	
			// 	chatHistory = [...chatHistory, infoCardsMessage]
			// 	knownMessageIds.add(infoCardsMessage.id)
			// }

			// Update chat timestamp to bump to top
			updateCurrentChatTimestamp()

			// Keep processing active until streaming completes
			// Processing will be set to false when streaming ends
			return true // Processing completed successfully
		} catch (error) {
			console.error('Agent processing error:', error)
			const errorMessageId = (Date.now() + 2).toString()
			const errorMessage = {
				id: errorMessageId,
				role: 'error',
				content: 'Sorry, I encountered an error. Please try again.',
				timestamp: new Date().toISOString()
			}
			
			chatHistory = [...chatHistory, errorMessage]
			knownMessageIds.add(errorMessageId)

			clearTimeout(fallbackTimeout)
			isProcessing = false
			return true // Error handled, continue processing
		} finally {
			currentTimeout = null
			clearTimeout(fallbackTimeout)
		}
	}

	function clearHistory() {
		// Send clear message to agent
		client.send(JSON.stringify({"type":"cf_agent_chat_clear"}))

		// Cancel current task and queue
		if (currentTimeout) {
			clearTimeout(currentTimeout)
			currentTimeout = null
		}

		// Stop all active streams
		for (const [messageId, stream] of activeStreams) {
			if (stream.parser) {
				endMarkdownStream(stream.parser)
			}
			if (stream.message) {
				stream.message.streaming = false
			}
		}
		activeStreams.clear()

		// Stop processing and clear queue
		isProcessing = false
		messageQueue = []
		queuePaused = false

		// Save current chat to history before clearing
		saveChatHistory()

		// Clear chat state
		chatHistory = []
		currentStreamingMessage = null
		isMarkdownStreaming = false
		currentChatId = null
		selectedHistoryId = 'current'

		// Clear known message IDs
		knownMessageIds.clear()

		// Clear streaming parser
		streamingParser = null
		streamingRenderer = null
		streamingElement = null

		// Re-focus the input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function pauseQueue() {
		queuePaused = true
		// Don't interrupt current task, just pause queue processing

		// Re-focus the input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function resumeQueue() {
		queuePaused = false
		if (messageQueue.length > 0) {
			processQueue()
		}

		// Re-focus the input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function stopCurrentTask() {
		console.log('stopCurrentTask called, cleaning up streams...')
		
		// Stop all active streams
		for (const [messageId, stream] of activeStreams) {
			if (stream.parser) {
				endMarkdownStream(stream.parser)
			}
			if (stream.message) {
				stream.message.streaming = false
			}
		}
		
		// Clear all active streams
		activeStreams.clear()
		
		// Clear streaming state immediately
		isMarkdownStreaming = false
		currentStreamingMessage = null
		streamingParser = null
		streamingRenderer = null
		streamingElement = null

		// Only stop the current active task, don't clear queue
		if (currentTimeout) {
			clearTimeout(currentTimeout)
			currentTimeout = null
		}

		// Stop the current processing immediately
		isProcessing = false
		console.log('🛑 STOP TASK - isProcessing=false (user stopped)')

		// Update chat history to reflect stopped state and trigger reactivity
		chatHistory = [...chatHistory]

		// Re-focus the input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function pauseQueueItem(itemId) {
		const item = messageQueue.find((q) => q.id === itemId)
		if (item && item.status === 'queued') {
			item.paused = true
			messageQueue = [...messageQueue]
		}
	}

	function resumeQueueItem(itemId) {
		const item = messageQueue.find((q) => q.id === itemId)
		if (item && item.status === 'queued') {
			item.paused = false
			messageQueue = [...messageQueue]

			// If queue isn't paused and we're not processing, start processing
			if (!queuePaused && !isProcessing) {
				processQueue()
			}
		}
	}

	function stopQueueItem(itemId) {
		// Remove item from queue
		messageQueue = messageQueue.filter((q) => q.id !== itemId)
	}

	function stopProcessing() {
		pauseQueue()
		messageQueue = []

		// Re-focus the input
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function editMessage(messageId) {
		const message = chatHistory.find((m) => m.id === messageId)
		if (message && message.role === 'user') {
			editingMessageId = messageId
			editingContent = message.content
		}
	}

	function editQueueItem(queueItemId) {
		const queueItem = messageQueue.find((q) => q.id === queueItemId)
		if (queueItem && queueItem.status === 'queued') {
			editingMessageId = queueItemId
			editingContent = queueItem.userMessage
		}
	}

	function saveMessageEdit(messageId) {
		const messageIndex = chatHistory.findIndex((m) => m.id === messageId)
		if (messageIndex !== -1) {
			chatHistory[messageIndex].content = editingContent
			chatHistory = [...chatHistory]
		}
		editingMessageId = null
		editingContent = ''
	}

	function saveQueueItemEdit(queueItemId) {
		const queueItemIndex = messageQueue.findIndex((q) => q.id === queueItemId)
		if (queueItemIndex !== -1) {
			messageQueue[queueItemIndex].userMessage = editingContent
			messageQueue = [...messageQueue]
		}
		editingMessageId = null
		editingContent = ''
	}

	function cancelMessageEdit() {
		editingMessageId = null
		editingContent = ''
	}

	let currentChatId = $state(null)

	function generateHistoryTitle() {
		const firstUserMessage = chatHistory.find((m) => m.role === 'user')
		if (firstUserMessage) {
			return firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
		}
		return 'Chat conversation'
	}

	function saveChatHistory() {
		if (chatHistory.length > 0) {
			const historyItem = {
				id: Date.now().toString(),
				timestamp: new Date().toISOString(),
				title: generateHistoryTitle(),
				messages: [...chatHistory]
			}
			// Add new item to the beginning for proper sorting
			chatHistoryList = [historyItem, ...chatHistoryList]
		}
	}

	function updateCurrentChatTimestamp() {
		if (currentChatId && chatHistory.length > 0) {
			const index = chatHistoryList.findIndex((h) => h.id === currentChatId)
			if (index !== -1) {
				chatHistoryList[index].timestamp = new Date().toISOString()
				chatHistoryList[index].messages = [...chatHistory]
				// Move to front
				const item = chatHistoryList.splice(index, 1)[0]
				chatHistoryList = [item, ...chatHistoryList]
			}
		}
	}

	function loadChatHistory(historyId) {
		if (historyId === 'current' || historyId === currentChatId) {
			// Already current chat, do nothing
			return
		}

		const historyItem = chatHistoryList.find((h) => h.id === historyId)
		if (historyItem) {
			// Save current chat before switching
			if (chatHistory.length > 0 && !currentChatId) {
				saveChatHistory()
			}

			chatHistory = [...historyItem.messages]
			currentChatId = historyId
			isMarkdownStreaming = false
			selectedHistoryId = historyId
			
			// Rebuild known message IDs from the loaded history
			knownMessageIds.clear()
			for (const message of chatHistory) {
				if (message.id) {
					knownMessageIds.add(message.id)
				}
			}
		}
	}

	function handleHistoryChange(event) {
		const value = event.target.value
		if (value === 'current') {
			// Switch to current chat
			if (currentChatId) {
				chatHistory = []
				currentChatId = null
				isMarkdownStreaming = false
				knownMessageIds.clear()
			}
		} else if (value === 'show-all') {
			// TODO: Implement show all functionality
			console.log('Show all history')
			// Reset to current for now
			selectedHistoryId = 'current'
		} else if (value && value !== '') {
			loadChatHistory(value)
		}
	}

	// function deleteChatHistory(historyId) {
	// 	chatHistoryList = chatHistoryList.filter((h) => h.id !== historyId)
	// }

	function copyMessage(messageId) {
		const message = chatHistory.find((m) => m.id === messageId)
		if (message) {
			// For streaming markdown messages, copy the raw content instead of HTML
			const contentToCopy =
				(message.role === 'assistant' || message.role === 'assistant-doc') ? message.rawContent || message.content : message.content
			navigator.clipboard.writeText(contentToCopy)
		}
	}

	function thumbsUp(messageId) {
		console.log('Thumbs up for message:', messageId)
		// TODO: Implement feedback system
	}

	function thumbsDown(messageId) {
		console.log('Thumbs down for message:', messageId)
		// TODO: Implement feedback system
	}

	async function approveToolPermission(toolCallId) {
		console.log('Approving tool permission for:', toolCallId)
		
		// Find the tool call information
		let toolCallInfo = null
		for (const message of chatHistory) {
			if (message.role === 'info-cards') {
				const toolCard = message.cards.find(card => card.toolCallId === toolCallId)
				if (toolCard) {
					toolCallInfo = toolCard
					break
				}
			}
		}
		
		if (!toolCallInfo) {
			console.error('Could not find tool call information for:', toolCallId)
			return
		}
		
		// Find the most recent user message and assistant response
		const userMessage = [...chatHistory].reverse().find(msg => msg.role === 'user')
		const assistantMessage = [...chatHistory].reverse().find(msg => msg.role === 'assistant' || msg.role === 'assistant-doc')
		
		if (!userMessage || !assistantMessage) {
			console.error('Could not find user or assistant message for tool permission')
			return
		}
		
		// Get tool args from stored toolArgs or parse from details as fallback
		let toolArgs = toolCallInfo.toolArgs || {}
		if (!toolArgs || Object.keys(toolArgs).length === 0) {
			try {
				// First try to parse as "Args:" prefixed format
				const argsMatch = toolCallInfo.details.match(/Args:\s*({[\s\S]*?})(?:\n\n|$)/m)
				if (argsMatch) {
					toolArgs = JSON.parse(argsMatch[1])
				} else {
					// If no "Args:" prefix, try parsing the entire details as JSON
					toolArgs = JSON.parse(toolCallInfo.details)
				}
			} catch (error) {
				console.warn('Could not parse tool args from details:', toolCallInfo.details, error)
			}
		}

        let result = 'Yes, confirmed.'

        if (toolCallInfo.title === 'readPageContent') {
            result += `\n---page content---\n${await data.readPage(currentTab.id)}` 
        }

        if (toolCallInfo.title === 'openNewTab') {
            const newTab = data.newTab(data.spaceMeta.activeSpace, { 
                url: toolArgs.url,
                title: toolArgs.title
            })
            if (newTab) {
                // Activate the new tab
                data.activate(newTab.id)
                result += `\n---new tab created---\nTab ID: ${newTab.id}\nURL: ${toolArgs.url || 'about:newtab'}`
            } else {
                result += `\n---error---\nFailed to create new tab`
            }
        }
        if (toolCallInfo.title === 'displayHtml') {
            try {
                // The result should contain dataUrl and title from the tool execution
                const { html, title } = toolArgs;

				const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html)

				console.log('displayHtml', {dataUrl, title, toolArgs, toolCallInfo })
                const newTab = data.newTab(data.spaceMeta.activeSpace, { 
                    url: dataUrl,
                    title: title,
					shouldFocus: true
                })
                // if (newTab) {
                //     // Activate the new tab
                //     data.activate(newTab.id)
               result = `\n---HTML displayed in new tab---\nTab ID: ${newTab.id}\nTitle: ${title}`
                // } else {
                //     result = `\n---error---\nFailed to create HTML tab`
                // }
            } catch (parseError) {
                console.error('Failed to parse displayHtml result:', parseError);
                result = `\n---error---\nFailed to parse HTML display result: ${result}`
            }
        }
		
		// Construct the message payload with tool invocation result
		console.log('Sending model to backend:', selectedModel)
		const messagePayload = {
			id: crypto.randomUUID(),
			model: selectedModel,
			messages: [
				{
					id: userMessage.id,
					createdAt: userMessage.timestamp,
					role: 'user',
					content: userMessage.content,
					model: selectedModel,
					parts: [{
						type: 'text',
						text: userMessage.content
					}]
				},
				{
					id: assistantMessage.id,
					createdAt: assistantMessage.timestamp,
					role: 'assistant',
					content: assistantMessage.content || assistantMessage.rawContent || '',
					parts: [
						{ type: 'step-start' },
						{ type: 'text', text: assistantMessage.content || assistantMessage.rawContent || '' },
						{
							type: 'tool-invocation',
							toolInvocation: {
								state: 'result',
								step: 0,
								toolCallId: toolCallId,
								toolName: toolCallInfo.title,
								args: toolArgs,
								result
							}
						}
					],
					toolInvocations: [{
						state: 'result',
						step: 0,
						toolCallId: toolCallId,
						toolName: toolCallInfo.title,
						args: toolArgs,
						result
					}],
					revisionId: crypto.randomUUID()
				}
			]
		}
		
		// Send the complete chat message
		client.send(JSON.stringify({
			id: crypto.randomUUID(),
			init: {
				body: JSON.stringify(messagePayload),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST'
			},
			type: 'cf_agent_use_chat_request',
			url: '/api/chat'
		}))
		
		// Update the card status
		const updatedHistory = chatHistory.map(message => {
			if (message.role === 'info-cards') {
				const updatedCards = message.cards.map(card => {
					if (card.toolCallId === toolCallId) {
						return {
							...card,
							status: 'approved',
							permissionResult: 'Yes, confirmed.',
							awaitingPermission: false
						}
					}
					return card
				})
				return { ...message, cards: updatedCards }
			}
			return message
		})
		
		chatHistory = updatedHistory
	}

	function rejectToolPermission(toolCallId) {
		console.log('Rejecting tool permission for:', toolCallId)
		
		// Find the tool call information
		let toolCallInfo = null
		for (const message of chatHistory) {
			if (message.role === 'info-cards') {
				const toolCard = message.cards.find(card => card.toolCallId === toolCallId)
				if (toolCard) {
					toolCallInfo = toolCard
					break
				}
			}
		}
		
		if (!toolCallInfo) {
			console.error('Could not find tool call information for:', toolCallId)
			return
		}
		
		// Find the most recent user message and assistant response
		const userMessage = [...chatHistory].reverse().find(msg => msg.role === 'user')
		const assistantMessage = [...chatHistory].reverse().find(msg => msg.role === 'assistant' || msg.role === 'assistant-doc')
		
		if (!userMessage || !assistantMessage) {
			console.error('Could not find user or assistant message for tool permission')
			return
		}
		
		// Get tool args from stored toolArgs or parse from details as fallback
		let toolArgs = toolCallInfo.toolArgs || {}
		if (!toolArgs || Object.keys(toolArgs).length === 0) {
			try {
				// First try to parse as "Args:" prefixed format
				const argsMatch = toolCallInfo.details.match(/Args:\s*({[\s\S]*?})(?:\n\n|$)/m)
				if (argsMatch) {
					toolArgs = JSON.parse(argsMatch[1])
				} else {
					// If no "Args:" prefix, try parsing the entire details as JSON
					toolArgs = JSON.parse(toolCallInfo.details)
				}
			} catch (error) {
				console.warn('Could not parse tool args from details:', toolCallInfo.details, error)
			}
		}
		
		// Construct the message payload with tool invocation result
		console.log('Sending model to backend:', selectedModel)
		const messagePayload = {
			id: crypto.randomUUID(),
			model: selectedModel,
			messages: [
				{
					id: userMessage.id,
					createdAt: userMessage.timestamp,
					role: 'user',
					content: userMessage.content,
					model: selectedModel,
					parts: [{
						type: 'text',
						text: userMessage.content
					}]
				},
				{
					id: assistantMessage.id,
					createdAt: assistantMessage.timestamp,
					role: 'assistant',
					content: assistantMessage.content || assistantMessage.rawContent || '',
					parts: [
						{ type: 'step-start' },
						{ type: 'text', text: assistantMessage.content || assistantMessage.rawContent || '' },
						{
							type: 'tool-invocation',
							toolInvocation: {
								state: 'result',
								step: 0,
								toolCallId: toolCallId,
								toolName: toolCallInfo.title,
								args: toolArgs,
								result: 'No, denied.'
							}
						}
					],
					toolInvocations: [{
						state: 'result',
						step: 0,
						toolCallId: toolCallId,
						toolName: toolCallInfo.title,
						args: toolArgs,
						result: 'No, denied.'
					}],
					revisionId: crypto.randomUUID()
				}
			]
		}
		
		// Send the complete chat message
		client.send(JSON.stringify({
			id: crypto.randomUUID(),
			init: {
				body: JSON.stringify(messagePayload),
				headers: { 'Content-Type': 'application/json' },
				method: 'POST'
			},
			type: 'cf_agent_use_chat_request',
			url: '/api/chat'
		}))
		
		// Update the card status
		const updatedHistory = chatHistory.map(message => {
			if (message.role === 'info-cards') {
				const updatedCards = message.cards.map(card => {
					if (card.toolCallId === toolCallId) {
						return {
							...card,
							status: 'denied',
							permissionResult: 'No, denied.',
							awaitingPermission: false
						}
					}
					return card
				})
				return { ...message, cards: updatedCards }
			}
			return message
		})
		
		chatHistory = updatedHistory
	}

	function handleActionButton(action) {
		switch (action) {
			case 'search':
				// Use test doc function
				handleTestDoc()
				break
			case 'ask':
				conversation = conversation || 'ask about '
				break
			case 'do':
				conversation = conversation || 'do '
				break
			case 'remember':
				conversation = conversation || 'remember '
				break
			case 'listen':
				// conversation = conversation || 'listen to '
				if (!conv) {
					startVoice()
				} else {
					stopVoice()
				}
				return
			case 'see':
				conversation = conversation || 'show me '
				break
			default:
				break
		}
		const input = document.querySelector('.agent-conversation-input')
		if (input) input.focus()
	}

	function handleTestCards() {
		// Add user message
		const userMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: 'cards',
			timestamp: new Date().toISOString()
		}
		chatHistory = [...chatHistory, userMessage]
		knownMessageIds.add(userMessage.id)

		// Show all possible test cards
		const testCards = [
			{
				type: 'context',
				action: 'read-tab',
				status: 'accessed',
				title: currentTab ? currentTab.title || 'Untitled Tab' : 'Test Tab',
				url: currentTab ? currentTab.url : 'https://example.com',
				favicon: currentTab ? currentTab.favicon : null
			},
			{
				type: 'context',
				action: 'read-space',
				status: 'accessed',
				title: 'Current Space',
				details: '5 tabs'
			},
			{
				type: 'context',
				action: 'read-all-spaces',
				status: 'accessed',
				title: 'All Spaces',
				details: '3 spaces total'
			},
			{
				type: 'tool',
				action: 'web-search',
				status: 'accessed',
				title: 'Web Search',
				details: 'Searching for relevant information'
			},
			{
				type: 'tool',
				action: 'execute-js',
				status: 'accessed',
				title: 'JavaScript Execution',
				details: currentTab ? currentTab.title || 'Current Tab' : 'No target tab'
			},
			{
				type: 'tool',
				action: 'screenshot',
				status: 'accessed',
				title: 'Page Analysis',
				details: 'Analyzing current page content'
			},
			{
				type: 'tool',
				action: 'modify-content',
				status: 'modified',
				title: 'Content Modification',
				details: 'Modifying page content'
			},
			{
				type: 'tool',
				action: 'inject-script',
				status: 'accessed',
				title: 'Script Injection',
				details: 'Adding custom functionality'
			},
			{
				type: 'tool',
				action: 'clipboard-access',
				status: 'accessed',
				title: 'Clipboard Access',
				details: 'Reading/writing clipboard'
			},
			{
				type: 'tool',
				action: 'file-download',
				status: 'accessed',
				title: 'File Download',
				details: 'Downloading file to device'
			},
			{
				type: 'tool',
				action: 'file-upload',
				status: 'accessed',
				title: 'File Upload',
				details: 'Uploading file from device'
			},
			{
				type: 'tool',
				action: 'api-call',
				status: 'accessed',
				title: 'API Request',
				details: 'Making external API call'
			},
			{
				type: 'tool',
				action: 'local-storage',
				status: 'accessed',
				title: 'Local Storage',
				details: 'Storing data locally'
			},
			{
				type: 'tool',
				action: 'css-injection',
				status: 'modified',
				title: 'CSS Injection',
				details: 'Custom styling applied'
			},
			{
				type: 'security',
				action: 'camera-access',
				status: 'accessed',
				title: 'Camera Access',
				details: 'Requesting camera permission'
			},
			{
				type: 'security',
				action: 'microphone-access',
				status: 'denied',
				title: 'Microphone Access',
				details: 'User denied microphone access'
			},
			{
				type: 'security',
				action: 'location-access',
				status: 'accessed',
				title: 'Location Access',
				details: 'Accessing device location'
			},
			{
				type: 'security',
				action: 'notification-permission',
				status: 'accessed',
				title: 'Notifications',
				details: 'Permission to show notifications'
			},
			{
				type: 'security',
				action: 'fullscreen-request',
				status: 'accessed',
				title: 'Fullscreen Mode',
				details: 'Entering fullscreen view'
			},
			{
				type: 'security',
				action: 'ad-block',
				status: 'denied',
				title: 'Ad Blocked',
				details: 'Blocked advertisement content'
			},
			{
				type: 'security',
				action: 'analytics-block',
				status: 'denied',
				title: 'Analytics Blocked',
				details: 'Blocked tracking scripts'
			},
			{
				type: 'security',
				action: 'malware-scan',
				status: 'accessed',
				title: 'Security Scan',
				details: 'Scanning for threats'
			},
			{
				type: 'security',
				action: 'proxy-detection',
				status: 'accessed',
				title: 'Proxy Detection',
				details: 'Checking network routing'
			}
		]

		const infoCardsMessage = {
			id: Date.now().toString(),
			role: 'info-cards',
			cards: testCards,
			timestamp: new Date().toISOString()
		}
		
		chatHistory = [...chatHistory, infoCardsMessage]
		knownMessageIds.add(infoCardsMessage.id)
		updateCurrentChatTimestamp()
	}

	function handleTestDoc() {
		// Add user message
		const userMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: 'doc',
			timestamp: new Date().toISOString()
		}
		chatHistory = [...chatHistory, userMessage]
		knownMessageIds.add(userMessage.id)

		// Generate test markdown document but manage processing state properly
		generateTestMarkdownDocumentForTest()
	}

	async function handleTestMessage() {
		// Add user message
		const userMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: 'test',
			timestamp: new Date().toISOString()
		}
		chatHistory = [...chatHistory, userMessage]
		knownMessageIds.add(userMessage.id)

		// Add simple assistant response with proper content structure
		const assistantMessage = {
			id: Date.now().toString(),
			role: 'assistant',
			content: 'Hello world! This is a test response.',
			rawContent: 'Hello world! This is a test response.',
			timestamp: new Date().toISOString(),
			streaming: false,
			model: selectedModel
		}

		chatHistory = [...chatHistory, assistantMessage]
		knownMessageIds.add(assistantMessage.id)
		updateCurrentChatTimestamp()

		// Wait for DOM to update, then initialize content for non-streaming message
		await tick()
		initializeNonStreamingMessage(assistantMessage.id, assistantMessage.rawContent)
	}

	async function generateTestMarkdownDocumentForTest() {
		// Add streaming markdown message without setting global processing state
		const markdownMessageId = Date.now().toString()
		const streamingMessage = {
			id: markdownMessageId,
			role: 'assistant-doc',
			content: '',
			rawContent: '',
			timestamp: new Date().toISOString(),
			streaming: true,
			model: selectedModel
		}

		chatHistory = [...chatHistory, streamingMessage]
		knownMessageIds.add(markdownMessageId)

		// Wait for DOM to update, then initialize streaming parser
		await tick()
		
		const streamingSetup = startMarkdownStream(markdownMessageId)
		if (!streamingSetup) return

		// Test markdown document (shorter version)
		const testMarkdown = `# Test Document

## Overview

This is a test markdown document to demonstrate the document rendering format.

### Features

- **Markdown rendering**: Full markdown support
- **Streaming display**: Content appears progressively  
- **Document layout**: Optimized for longer content

### Code Example

\`\`\`javascript
function example() {
    console.log("Hello from test document!")
    return "success"
}
\`\`\`

### Summary

This demonstrates the assistant-doc message format with proper markdown rendering and document-style layout.

---

*Test completed successfully*`

		// Split into chunks and stream
		const chunks = []
		let remaining = testMarkdown
		while (remaining.length > 0) {
			const chunkLength = Math.floor(Math.random() * 40) + 30
			const chunk = remaining.substring(0, chunkLength)
			chunks.push(chunk)
			remaining = remaining.substring(chunkLength)
		}

		// Stream the chunks
		let chunkIndex = 0
		const streamNextChunk = () => {
			if (chunkIndex < chunks.length) {
				const chunk = chunks[chunkIndex]
				streamingMessage.rawContent += chunk
				writeMarkdownChunk(streamingSetup.parser, chunk)
				chatHistory = [...chatHistory]
				chunkIndex++
				setTimeout(streamNextChunk, 150)
			} else {
				// Streaming complete
				streamingMessage.streaming = false
				endMarkdownStream(streamingSetup.parser)
				chatHistory = [...chatHistory]
				updateCurrentChatTimestamp()
			}
		}

		setTimeout(streamNextChunk, 100)
	}

	async function generateTestMarkdownDocument() {
		if (isProcessing) return

		isProcessing = true
		const messageId = Date.now().toString()

		// Add user message
		const userMessage = {
			id: messageId,
			role: 'user',
			content: 'Generate a test markdown document',
			timestamp: new Date().toISOString()
		}
		
		chatHistory = [...chatHistory, userMessage]
		knownMessageIds.add(messageId)

		// Add streaming markdown message
		const markdownMessageId = (Date.now() + 1).toString()
		currentStreamingMessage = {
			id: markdownMessageId,
			role: 'assistant-doc',
			content: '',
			rawContent: '',
			timestamp: new Date().toISOString(),
			streaming: true,
			model: selectedModel
		}

		chatHistory = [...chatHistory, currentStreamingMessage]
		knownMessageIds.add(markdownMessageId)

		// Initialize streaming
		isMarkdownStreaming = true

		// Wait for DOM to update, then initialize streaming parser
		await new Promise((resolve) => setTimeout(resolve, 100))

		const streamingSetup = startMarkdownStream(markdownMessageId)
		if (streamingSetup) {
			streamingParser = streamingSetup.parser
			streamingRenderer = streamingSetup.renderer
			streamingElement = streamingSetup.element
		}

		// Test markdown document
		const testMarkdown = `# Comprehensive Analysis Report

## Executive Summary

This document provides a detailed analysis of the current system architecture and recommendations for future improvements. The analysis covers performance metrics, security considerations, and scalability patterns.

### Key Findings

- **Performance**: Current response times average 120ms
- **Security**: All endpoints properly authenticated  
- **Scalability**: System can handle 10,000 concurrent users
- **Reliability**: 99.97% uptime achieved

## Technical Architecture

### Current Stack

The system is built using modern web technologies:

\`\`\`javascript
// Example configuration
const config = {
    database: 'postgresql',
    cache: 'redis',
    framework: 'svelte',
    deployment: 'docker'
}
\`\`\`

### Database Schema

| Table | Records | Growth Rate |
|-------|---------|-------------|
| Users | 50,000 | 5% monthly |
| Sessions | 2.3M | 15% monthly |
| Analytics | 890K | 25% monthly |

## Performance Metrics

### Response Times
- **API Endpoints**: 95ms average
- **Database Queries**: 15ms average  
- **Cache Hit Rate**: 87%

### Load Testing Results

We conducted comprehensive load testing with the following results:

1. **Baseline Performance**: 1000 req/sec
2. **Peak Load**: 5000 req/sec sustained
3. **Breaking Point**: 8500 req/sec

## Security Assessment

### Authentication
- Multi-factor authentication implemented
- JWT tokens with 15-minute expiration
- Rate limiting: 100 requests per minute

### Data Protection
- All data encrypted at rest using AES-256
- TLS 1.3 for data in transit
- Regular security audits performed

## Recommendations

### Short Term (Next 3 months)
1. **Optimize database queries** - Reduce average query time by 30%
2. **Implement CDN** - Improve global response times
3. **Add monitoring** - Enhanced observability with Datadog

### Long Term (Next 12 months)
1. **Microservices migration** - Break monolith into services
2. **Auto-scaling** - Implement Kubernetes horizontal scaling
3. **Multi-region deployment** - Add redundancy across regions

## Conclusion

The current system demonstrates strong performance and security characteristics. With the recommended improvements, we can achieve:

- 50% faster response times
- 99.99% uptime SLA
- Support for 100,000 concurrent users
- Enhanced security posture

> **Note**: All metrics are based on production data from the last 6 months. Implementation timeline depends on resource allocation and business priorities.

---

*Report generated on ${new Date().toLocaleDateString()}*`

		// Split into small random-length chunks (20-40 chars)
		const chunks = []
		let remaining = testMarkdown

		while (remaining.length > 0) {
			const chunkLength = Math.floor(Math.random() * 55) + 65
			const chunk = remaining.substring(0, chunkLength)
			chunks.push(chunk)
			remaining = remaining.substring(chunkLength)
		}

		// Stream the chunks
		let chunkIndex = 0

		const streamNextChunk = () => {
			if (chunkIndex < chunks.length) {
				const chunk = chunks[chunkIndex]

				// Add to raw content for backup
				currentStreamingMessage.rawContent += chunk

				// Write to streaming parser
				writeMarkdownChunk(streamingParser, chunk)

				chatHistory = [...chatHistory]

				chunkIndex++

				currentTimeout = setTimeout(streamNextChunk, 300)
			} else {
				// Streaming complete
				isMarkdownStreaming = false
				currentStreamingMessage.streaming = false

				// End the stream
				endMarkdownStream(streamingParser)

				chatHistory = [...chatHistory]

				isProcessing = false
				currentTimeout = null

				// Clear streaming state but keep the content
				currentStreamingMessage = null
				streamingParser = null
				streamingRenderer = null
				streamingElement = null

				const input = document.querySelector('.agent-conversation-input')
				if (input) input.focus()
			}
		}

		setTimeout(streamNextChunk, 350)
	}

	// Create agent iframe URL with Eleven Labs token
	const agentIframeUrl = $derived.by(() => {
		if (typeof localStorage === 'undefined') {
			return 'https://localhost:5194/agent'
		}
		
		const elevenlabsToken = localStorage.getItem('aiToken_elevenlabs')
		if (!elevenlabsToken) {
			return 'https://localhost:5194/agent'
		}
		
		const url = new URL('https://localhost:5194/agent')
		url.searchParams.set('agent_id', elevenlabsToken)
		return url.toString()
	})

	onMount(() => {
		client = new AgentClient({
			agent: 'chat',
			name: 'default',
			host: 'localhost:5193'
		})

		client.onopen = () => {
			console.log('Connected to agent')
			// Send an initial message
			// client.send(JSON.stringify({ type: "join", user: "user123" }));
		}

		// Load selected model from localStorage
		if (typeof localStorage !== 'undefined') {
			const savedModel = localStorage.getItem('selectedModel')
			if (savedModel) {
				selectedModel = savedModel
				console.log('Loaded model from localStorage:', savedModel)
			}
		}

		// Listen for messages from ElevenLabs voice agent iframe
		async function handleAgentMessage(event) {
			if (event.data.type === 'agent-message') {
				const message = event.data.data
				console.log('Received agent message:', message)
				console.log('Message source:', message.source)
				console.log('Message content:', message.message)
				
				// Add message to chat history
				const messageId = crypto.randomUUID()
				const content = message.message || message.text || message.content || JSON.stringify(message)
				
				// Parse XML tags for voice agent responses (only for assistant messages)
				let parsedContent = { model: 'elevenlabs-voice', cleanContent: content }
				if (message.source !== 'user') {
					parsedContent = parseVoiceContent(content)
				}
				
				const agentMessage = {
					id: messageId,
					role: message.source === 'user' ? 'user' : 'assistant',
					content: parsedContent.cleanContent,
					rawContent: parsedContent.cleanContent,
					timestamp: Date.now(),
					streaming: false,
					model: message.source === 'user' ? 'elevenlabs-voice' : parsedContent.model
				}
				
				console.log('Created agent message:', agentMessage)
				chatHistory = [...chatHistory, agentMessage]
				knownMessageIds.add(messageId)

				// Initialize content for non-streaming assistant messages
				if (agentMessage.role === 'assistant') {
					await tick()
					initializeNonStreamingMessage(messageId, parsedContent.cleanContent)
				}
			}
		}

		window.addEventListener('message', handleAgentMessage)

		client.onmessage = (event) => {
			// Handle incoming messages
			const data = JSON.parse(event.data)
			console.log('Received message:', data)


			// { "mcp": { "prompts": [], "resources": [], "servers": {}, "tools": [] }, "type": "cf_agent_mcp_servers" }

			// "body": "f:{\"messageId\":\"msg-AI9pv13V8IEr5o6jevyUFeAL\"}\n", "done": false, "id": "LdxkiFBI
			//  { "body": "0:\" you've typed \\\"asdf\\\" - that doesn't seem to be a specific\"\n", "done": false, "id": "LdxkiFBI", "type": "cf_agent_use_chat_response" }

			//{ "body": "e:{\"finishReason\":\"stop\",\"usage\":{\"promptTokens\":1287,\"completionTokens\":124},\"isContinued\":false}\n", "done": false, "id": "LdxkiFBI", "type": "cf_agent_use_chat_response" }

			// Ignore empty status messages - these are just completion signals
			if (data.type === 'cf_agent_use_chat_response' && (!data.body || data.body.trim() === '')) {
				console.log('Ignoring empty status message:', data)
				return
			}

			// Check if this is a streaming message chunk
			if (data.type === 'cf_agent_use_chat_response' && data.body && data.body.startsWith('0:')) {
				handleStreamingChunk(data, { type: 'message' })
				return
			}

			// Check if this is a stream completion message
			if (data.type === 'cf_agent_use_chat_response' && data.body && data.body.startsWith('e:')) {
				handleStreamingChunk(data, { type: 'completion' })
				return
			}

			// Check if this is a tool call message
			if (data.type === 'cf_agent_use_chat_response' && data.body && data.body.startsWith('9:')) {
				handleToolCall(data)
				return
			}

			// Check if this is a tool result message
			if (data.type === 'cf_agent_use_chat_response' && data.body && data.body.startsWith('a:')) {
				handleToolResult(data)
				return
			}

			// Check if this is a response summary
			if (data.type === 'cf_agent_use_chat_response' && data.body && data.body.startsWith('d:')) {
				handleResponseSummary(data)
				return
			}

			// Handle complete message updates
			if (data.type === 'cf_agent_chat_messages') {
				handleChatMessages(data)
				return
			}

			if (data.type === 'state_update') {
				// Update local UI with new state
				//updateUI(data.state);
				console.log('state upd', data)
			}
		}

		client.onclose = () => console.log('Disconnected from agent')
		
		// Auto-focus the input when sidebar opens
		const input = document.querySelector('.agent-conversation-input')
		if (input) {
			setTimeout(() => input.focus(), 100)
		}

		// Initialize empty history (no localStorage persistence)
		chatHistoryList = []

		return () => {

			window.removeEventListener('message', handleAgentMessage)

			if (client) {
				client.close()
			}
		}
	})
</script>

<RightSidebar
	title="Agent"
	padding={false}
	{onClose}
	{openSidebars}
	{switchToResources}
	{switchToSettings}
	{switchToUserMods}
	{switchToActivity}
	switchToAgent={switchToAIAgent}
>
	{#snippet children()}
		<div class="agent-sticky-header">
			<div class="agent-header-row">
				<select class="agent-model-select" bind:value={selectedHistoryId} onchange={handleHistoryChange}>
					<option value="current">Current chat</option>
					{#each chatHistoryList.slice(0, 10) as historyItem}
						<option value={historyItem.id}
							>{historyItem.title} [{new Date(historyItem.timestamp).toLocaleDateString()}]</option
						>
					{/each}
					{#if chatHistoryList.length > 10}
						<option value="show-all">Show all {chatHistoryList.length} chats...</option>
					{/if}
				</select>

				<select class="agent-model-select" bind:value={selectedModel} onchange={handleModelChange}>
					{#each models as model}
						<option value={model.id}>{model.name}</option>
					{/each}
				</select>
			</div>

			<div class="agent-target-selector">
				<div class="agent-selector-row">
					<label class="agent-context-label">Context:</label>
					<select class="agent-context-select" bind:value={selectedTarget}>
						{#each availableTargets as target}
							<option value={target.id}>{target.name}</option>
						{/each}
					</select>
				</div>
			</div>

			{#if conv}
				<!-- TODO: orange microphone indicator and background mic when sidebar closed, secure uri -->
				<iframe style="background-color: #000; height: 100px;" title="voice-agent" src={agentIframeUrl} allow="microphone; clipboard-read; clipboard-write; screen-wake-lock 'self'"></iframe>
			{/if}
		</div>

		<div class="agent-chat-container">
			{#if chatHistory.length > 0 || messageQueue.length > 0}
				<div class="agent-chat-history">
					{#each chatHistory as message}
						{#if message.role === 'info-cards'}
							<div class="agent-info-cards">
								{#each message.cards as card}
									<div
										class="agent-info-card"
										class:context={card.type === 'context'}
										class:tool={card.type === 'tool'}
										class:security={card.type === 'security'}
										class:accessed={card.status === 'accessed'}
										class:modified={card.status === 'modified'}
										class:denied={card.status === 'denied'}
									>
									<div class="agent-info-card-header">
										<div class="agent-info-card-icon">
											{#if card.action === 'read-tab'}
												{#if card.favicon}
													<img src={card.favicon} alt="" class="agent-info-card-favicon" />
												{:else}
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z"
														/>
													</svg>
												{/if}
											{:else if card.action === 'read-space' || card.action === 'read-all-spaces'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z"
													/>
												</svg>
											{:else if card.action === 'web-search'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
													/>
												</svg>
											{:else if card.action === 'execute-js'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 1 3.75 6v12A2.25 2.25 0 0 1 6 20.25Z"
													/>
												</svg>
											{:else if card.action === 'modify-content'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
													/>
												</svg>
											{:else if card.action === 'inject-script'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
													/>
												</svg>
											{:else if card.action === 'block-request'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
													/>
												</svg>
											{:else if card.action === 'grant-permission'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
											{:else if card.action === 'api-call'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
											{:else if card.action === 'access-cookies'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
													/>
												</svg>
											{:else if card.action === 'file-download'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
													/>
												</svg>
											{:else if card.action === 'file-upload'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
													/>
												</svg>
											{:else if card.action === 'screenshot'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
													/>
												</svg>
											{:else if card.action === 'notification-permission'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
													/>
												</svg>
											{:else if card.action === 'location-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
													/>
												</svg>
											{:else if card.action === 'camera-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
													/>
												</svg>
											{:else if card.action === 'microphone-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
													/>
												</svg>
											{:else if card.action === 'clipboard-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
													/>
												</svg>
											{:else if card.action === 'fullscreen-request'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
													/>
												</svg>
											{:else if card.action === 'local-storage'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
													/>
												</svg>
											{:else if card.action === 'proxy-detection'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
													/>
												</svg>
											{:else if card.action === 'analytics-block'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
													/>
												</svg>
											{:else if card.action === 'ad-block'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
													/>
												</svg>
											{:else if card.action === 'malware-scan'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
													/>
												</svg>
											{:else if card.action === 'css-injection'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
													/>
												</svg>
											{:else if card.action === 'page-redirect'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
													/>
												</svg>
											{:else if card.action === 'print-dialog'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M18.75 9V6a2.25 2.25 0 0 0-2.25-2.25H7.5A2.25 2.25 0 0 0 5.25 6v3M6.75 9h10.5m-10.5 0V6a2.25 2.25 0 0 1 2.25-2.25h6A2.25 2.25 0 0 1 17.25 6v3"
													/>
												</svg>
											{:else if card.action === 'tool-call'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
													/>
												</svg>

											{/if}
										</div>
										<div class="agent-info-card-text">
											<div class="agent-info-card-title">{card.title}</div>
											{#if card.details}
												<div class="agent-info-card-details">{card.details}</div>
											{:else if card.url}
												<div class="agent-info-card-url">{card.url}</div>
											{/if}
										</div>
									</div>
									
									<!-- Debug info -->
									<!-- <div style="font-size: 9px; color: rgba(255,255,255,0.3); margin-top: 4px;">
										DEBUG: needsPermission={card.needsPermission}, awaitingPermission={card.awaitingPermission}, status={card.status}, result={card.result}
									</div> -->
									
									{#if card.awaitingPermission}
										<div class="agent-info-card-actions">
											<button
												class="agent-permission-btn approve"
												onclick={() => approveToolPermission(card.toolCallId)}
												title="Approve tool permission"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
												Accept
											</button>
											<button
												class="agent-permission-btn reject"
												onclick={() => rejectToolPermission(card.toolCallId)}
												title="Reject tool permission"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
													/>
												</svg>
												Reject
											</button>
										</div>
									{:else if card.needsPermission && card.permissionResult}
										<div class="agent-info-card-result">
											<div class="agent-permission-result {card.status}">
												{card.status === 'approved' ? 'Approved' : 'Denied'}
											</div>
										</div>
									{:else if card.result}
										<div class="agent-info-card-result">
											<div class="agent-tool-result">
												Result: {card.result}
											</div>
										</div>
									{/if}
									</div>
								{/each}
							</div>
						{:else if message.role === 'assistant' || message.role === 'assistant-doc'}
							<div
								class="agent-markdown-message"
								class:assistant-chat={message.role === 'assistant'}
								class:assistant-doc={message.role === 'assistant-doc'}
								data-message-id={message.id}
								role="group"
								onmouseenter={() => (hoveredMessageId = message.id)}
								onmouseleave={() => (hoveredMessageId = null)}
							>
								<div class="agent-message-header">
									<div class="agent-avatar">
										{@html models.find(m => m.id === message.model)?.icon || `
											<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
												<circle cx="12" cy="12" r="10" fill="#8B5CF6"/>
												<circle cx="12" cy="12" r="6" fill="#FFFFFF"/>
												<circle cx="12" cy="12" r="2" fill="#8B5CF6"/>
											</svg>
										`}
										{#if models.find(m => m.id === message.model)?.avatarTitle}
											<div class="agent-avatar-title-overlay">
												{models.find(m => m.id === message.model)?.avatarTitle}
											</div>
										{/if}
									</div>
								</div>
								<div class="agent-markdown-content">
									<div class="agent-markdown-streaming" class:streaming={message.streaming}>
										<!-- Markdown content will be inserted here by the streaming-markdown library -->
									</div>
								</div>
								<div class="agent-markdown-time-row">
									<div class="agent-chat-message-time">
										{new Date(message.timestamp).toLocaleTimeString()}
									</div>
									<div class="agent-message-actions" class:visible={hoveredMessageId === message.id}>
										<button
											class="agent-action-btn"
											onclick={() => thumbsUp(message.id)}
											title="Good response"
											aria-label="Good response"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5.904 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z"
												/>
											</svg>
										</button>
										<button
											class="agent-action-btn"
											onclick={() => thumbsDown(message.id)}
											title="Poor response"
											aria-label="Poor response"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.997 7.997 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-2.824 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 1.302-4.665c0-1.194-.232-2.333-.654-3.375Z"
												/>
											</svg>
										</button>
										<button
											class="agent-action-btn"
											onclick={() => copyMessage(message.id)}
											title="Copy message"
											aria-label="Copy message"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
												/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						{:else if message.role === 'response-divider'}
							<div class="agent-response-divider">
								{message.content}
							</div>
						{:else}
							<div
								class="agent-chat-message"
								class:user={message.role === 'user'}
								class:error={message.role === 'error'}
								class:token-summary={message.isTokenSummary}
								role="group"
								onmouseenter={() => (hoveredMessageId = message.id)}
								onmouseleave={() => (hoveredMessageId = null)}
							>
								<div class="agent-chat-message-content">
									{#if editingMessageId === message.id}
										<div class="agent-edit-container">
											<textarea
												class="agent-edit-input"
												bind:value={editingContent}
												placeholder="Edit your message..."
												rows="3"
											></textarea>
											<div class="agent-edit-actions">
												<button class="agent-edit-btn save" onmousedown={() => saveMessageEdit(message.id)}>Save</button
												>
												<button class="agent-edit-btn cancel" onmousedown={cancelMessageEdit}>Cancel</button>
											</div>
										</div>
									{:else}
										<div class="agent-message-text">
											{message.content}
										</div>
									{/if}
								</div>
								<div class="agent-chat-message-time-row">
									<div class="agent-chat-message-time">
										{new Date(message.timestamp).toLocaleTimeString()}
									</div>
								</div>
							</div>
						{/if}
					{/each}

					{#if isProcessing}
						<div class="agent-chat-message assistant">
							<div class="agent-chat-message-content">
								<div class="agent-typing-indicator">
									<span></span>
									<span></span>
									<span></span>
								</div>
							</div>
						</div>
					{/if}

					{#if messageQueue.filter((item) => item.status === 'queued').length > 0}
						<div class="agent-global-controls">
							{#if queuePaused}
								<button
									class="agent-queue-btn"
									onmousedown={resumeQueue}
									title="Resume Queue"
									aria-label="Resume Queue"
								>
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
										/>
									</svg>
								</button>
							{:else}
								<button class="agent-queue-btn" onmousedown={pauseQueue} title="Pause Queue" aria-label="Pause Queue">
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
									</svg>
								</button>
							{/if}
						</div>
					{/if}

					{#if messageQueue.filter((item) => item.status === 'queued').length > 0}
						{#each messageQueue.filter((item) => item.status === 'queued') as queueItem, index}
							<div class="agent-chat-message user queued" class:paused={queueItem.paused}>
								<div class="agent-chat-message-content">
									{#if editingMessageId === queueItem.id}
										<div class="agent-edit-container">
											<textarea
												class="agent-edit-input"
												bind:value={editingContent}
												placeholder="Edit your message..."
												rows="3"
											></textarea>
											<div class="agent-edit-actions">
												<button class="agent-edit-btn save" onmousedown={() => saveQueueItemEdit(queueItem.id)}>Save</button
												>
												<button class="agent-edit-btn cancel" onmousedown={cancelMessageEdit}>Cancel</button>
											</div>
										</div>
									{:else}
										<div
											class="agent-message-text editable"
											role="button"
											onclick={() => editQueueItem(queueItem.id)}
										>
											{queueItem.userMessage}
										</div>
									{/if}
								</div>
								<div class="agent-chat-message-time-row">
									<div class="agent-chat-message-time">
										Queued #{index + 1}
										{queueItem.paused ? '(Paused)' : ''}
									</div>
									<div class="agent-queue-item-controls">
										{#if queueItem.paused}
											<button
												class="agent-queue-item-btn play"
												onmousedown={() => resumeQueueItem(queueItem.id)}
												title="Resume this item"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
													/>
												</svg>
											</button>
										{:else}
											<button
												class="agent-queue-item-btn pause"
												onmousedown={() => pauseQueueItem(queueItem.id)}
												title="Pause this item"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
												</svg>
											</button>
										{/if}
										<button
											class="agent-queue-item-btn stop"
											onmousedown={() => stopQueueItem(queueItem.id)}
											title="Remove this item"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

				</div>

	<div class="agent-bottom-sticky">
		<div class="agent-chat-input-container">
			<div class="agent-textarea-container">
				<textarea
					class="agent-conversation-input"
					bind:value={conversation}
					onkeydown={handleKeyDown}
					placeholder="We can do anything..."
					rows="3"
				></textarea>
				{#if isProcessing}
					<button
						class="agent-stop-button"
						onmousedown={stopCurrentTask}
						title="Stop Current Task"
						aria-label="Stop Current Task"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
							/>
						</svg>
					</button>
				{/if}
				<button
					class="agent-send-button"
					onmouseup={sendMessage}
					disabled={!conversation.trim()}
					title="Send (Enter)"
					aria-label="Send (Enter)"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
						/>
					</svg>
				</button>
			</div>

			<div class="agent-action-buttons">
				<button class="agent-quick-action" onmousedown={() => handleActionButton('search')}>search</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('ask')}>ask</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('do')}>do</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('remember')}>remember</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('listen')}>listen</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('see')}>see</button>
			</div>
		</div>

		{#if chatHistory.length > 0}
			<div class="agent-chat-actions">
				<button class="agent-clear-button" onmouseup={clearHistory}> New </button>
			</div>
		{/if}
	</div>

		<!-- Scroll padding for bringing input to top -->
		{#if chatHistory.length > 0}
			<div class="agent-chat-scroll-padding"></div>
		{/if}
	{/snippet}
</RightSidebar>

<style>
	.agent-sticky-header {
		position: sticky;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(10px);
		z-index: 10;
		padding: 16px 0 12px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		margin: 0 0 12px 0;
		top: 0px;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-sticky-header::after {
		content: '';
		position: absolute;
		bottom: -12px;
		left: 0;
		right: 0;
		height: 12px;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.95), transparent);
		pointer-events: none;
		z-index: 11;
	}

	.agent-header-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.agent-header-row select {
		flex: 1;
		min-width: 0;
	}

	.agent-history-dropdown {
		position: relative;
		display: inline-block;
		flex: 1;
	}

	.agent-history-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 6px 12px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}

	.agent-history-button:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-history-dropdown-content {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 4px;
		z-index: 1000;
		max-height: 320px;
		overflow-y: auto;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
		backdrop-filter: blur(10px);
		min-width: 280px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
		margin-top: 4px;
	}

	.agent-history-dropdown:hover .agent-history-dropdown-content {
		opacity: 1;
		pointer-events: auto;
	}

	.agent-history-item {
		display: flex;
		align-items: center;
		padding: 6px 8px;
		margin: 2px 0;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	.agent-history-item:hover,
	.agent-history-item.hover-xe {
		background: rgba(255, 255, 255, 0.05);
	}

	.agent-history-item.current-chat {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 4px;
	}

	.agent-history-item.current-chat .agent-history-item-main {
		cursor: default;
	}

	.agent-history-item.current-chat:hover,
	.agent-history-item.current-chat.hover-xe {
		background: rgba(255, 255, 255, 0.03);
	}

	.agent-history-item-main {
		flex: 1;
		cursor: pointer;
		min-width: 0;
	}

	.agent-history-item-title {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 2px;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-history-item-meta {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
	}

	.agent-history-item-delete {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 2px;
		border-radius: 2px;
		transition: all 0.2s ease;
		margin-left: 8px;
		flex-shrink: 0;
		opacity: 0;
	}

	.agent-history-item:hover .agent-history-item-delete,
	.agent-history-item.hover-xe .agent-history-item-delete {
		opacity: 1;
	}

	.agent-history-item-delete:hover,
	.agent-history-item-delete.hover-xe {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
	}

	.agent-history-empty {
		padding: 16px;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 11px;
	}

	.agent-history-show-all {
		margin-top: 4px;
		padding: 4px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.agent-show-all-button {
		width: 100%;
		background: transparent;
		border: none;
		padding: 6px 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		border-radius: 3px;
	}

	.agent-show-all-button:hover,
	.agent-show-all-button.hover-xe {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-target-selector {
		margin-bottom: 0;
	}

	.agent-selector-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.agent-context-label {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		flex-shrink: 0;
	}

	.agent-context-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: white;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex: 1;
		min-width: 0;
		max-width: 100%;
	}

	.agent-context-select:hover,
	:global(.agent-context-select.hover-xe) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-context-select:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-chat-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-chat-history {
		flex: 1;
		padding: 16px 0;
		overflow-y: auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		scroll-behavior: smooth;
        overflow-y: visible;
	}

	.agent-chat-scroll-padding {
		height: calc(100vh - 429px);
		flex-shrink: 0;
	}

	.agent-chat-message {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.agent-chat-message.user {
		align-items: flex-end;
	}

	.agent-chat-message.assistant {
		align-items: flex-start;
	}

	.agent-chat-message-content {
		max-width: 85%;
		padding: 8px 12px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.4;
		word-wrap: break-word;
	}

	.agent-chat-message.user .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.agent-chat-message.assistant .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.agent-chat-message.assistant.token-summary .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.6);
		font-size: 11px;
		opacity: 0.8;
	}

	.agent-chat-message.error .agent-chat-message-content {
		background: rgba(239, 68, 68, 0.8);
		color: white;
	}

	.agent-chat-message-time-row {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}

	.agent-chat-message-time {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		padding: 0 4px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.agent-message-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.agent-message-actions.visible {
		opacity: 1;
	}

	.agent-action-btn {
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		font-size: 11px;
	}

	.agent-action-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-typing-indicator {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.agent-typing-indicator span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.6);
		animation: typing 1.4s infinite ease-in-out;
	}

	.agent-typing-indicator span:nth-child(1) {
		animation-delay: -0.32s;
	}

	.agent-typing-indicator span:nth-child(2) {
		animation-delay: -0.16s;
	}

	@keyframes typing {
		0%,
		80%,
		100% {
			transform: scale(0);
		}
		40% {
			transform: scale(1);
		}
	}

	.agent-bottom-sticky {
		position: sticky;
		bottom: 0;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(20px);
		z-index: 10;
	}

	.agent-chat-input-container {
		padding: 16px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-model-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: white;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.agent-model-select:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-model-select:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-chat-message[class*='queued'] {
		opacity: 0.6;
	}

	.agent-chat-message.paused {
		opacity: 0.4;
		background: rgba(255, 255, 255, 0.02);
	}



	.agent-global-controls {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		margin: 8px 0;
	}

	.agent-queue-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.agent-queue-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-queue-item-controls {
		display: flex;
		gap: 4px;
	}

	.agent-queue-item-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		padding: 2px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.agent-queue-item-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-edit-container {
		width: 100%;
	}

	.agent-edit-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 8px;
		color: white;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		min-height: 60px;
		max-height: 200px;
		transition: all 0.2s ease;
	}

	.agent-edit-input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.agent-edit-actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}

	.agent-edit-btn {
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.agent-edit-btn.save {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.agent-edit-btn.save:hover {
		background: rgba(34, 197, 94, 0.3);
		border-color: rgba(34, 197, 94, 0.5);
	}

	.agent-edit-btn.cancel {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.7);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.agent-edit-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.agent-message-text.editable {
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: background 0.2s ease;
	}

	.agent-message-text.editable:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.agent-textarea-container {
		position: relative;
	}

	.agent-conversation-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 8px 80px 8px 8px;
		color: white;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		min-height: 20px;
		max-height: 120px;
		transition: all 0.2s ease;
	}

	.agent-conversation-input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-conversation-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.agent-conversation-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.agent-send-button {
		position: absolute;
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 2;
		bottom: 11px;
		right: 5px;
	}



	.agent-stop-button {
		position: absolute;
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 2;
		bottom: 11px;
		right: 40px;
	}

	.agent-send-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.agent-send-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.agent-stop-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-action-buttons {
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}

	.agent-quick-action {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.agent-quick-action:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-info-cards {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 8px 0;
	}

	.agent-info-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 12px;
		max-width: 90%;
		align-self: flex-start;
	}

	.agent-info-card.context {
		border-left: 2px solid rgba(59, 130, 246, 0.45);
		background: rgba(59, 130, 246, 0.05);
	}

	.agent-info-card.accessed {
		border-left: 2px solid rgba(34, 197, 94, 0.45);
		background: rgba(34, 197, 94, 0.05);
	}

	.agent-info-card.modified {
		border-left: 2px solid rgba(168, 85, 247, 0.45);
		background: rgba(168, 85, 247, 0.05);
	}

	.agent-info-card.denied {
		border-left: 2px solid rgba(239, 68, 68, 0.45);
		background: rgba(239, 68, 68, 0.05);
	}

	.agent-info-card.approved {
		border-left: 2px solid rgba(34, 197, 94, 0.45);
		background: rgba(34, 197, 94, 0.05);
	}

	.agent-info-card.processing {
		border-left: 2px solid rgba(251, 191, 36, 0.45);
		background: rgba(251, 191, 36, 0.05);
	}

	.agent-info-card-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.agent-info-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		flex-shrink: 0;
	}

	.agent-info-card-favicon {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.agent-info-card-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.agent-info-card-title {
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-info-card-details,
	.agent-info-card-url {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-info-card.tool .agent-info-card-details {
		white-space: pre-wrap;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		overflow: visible;
		text-overflow: unset;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		padding: 6px;
		margin-top: 4px;
		max-height: 120px;
		overflow-y: auto;
	}

	.agent-info-card-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.agent-permission-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
		font-weight: 500;
	}

	.agent-permission-btn.approve {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.agent-permission-btn.approve:hover {
		background: rgba(34, 197, 94, 0.3);
		border-color: rgba(34, 197, 94, 0.5);
		color: white;
	}

	.agent-permission-btn.reject {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.agent-permission-btn.reject:hover {
		background: rgba(239, 68, 68, 0.3);
		border-color: rgba(239, 68, 68, 0.5);
		color: white;
	}

	.agent-info-card-result {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.agent-permission-result {
		font-size: 10px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 3px;
		display: inline-block;
	}

	.agent-permission-result.approved {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.agent-permission-result.denied {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.agent-tool-result {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.8);
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		padding: 6px;
		white-space: pre-wrap;
		max-height: 80px;
		overflow-y: auto;
	}

	.agent-chat-actions {
		padding: 12px 0 20px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}

	.agent-clear-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 12px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		width: auto;
		margin: 0 auto;
		display: block;
	}

	.agent-clear-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-markdown-message {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin: 16px 0;
		align-items: flex-start;
		animation: messageSlideIn 0.3s ease-out;
        /* border-top-left-radius: 0; */
	}

	.agent-message-header {
		display: flex;
		align-items: center;
		margin-bottom: 4px;
		gap: 8px;
	}

	.agent-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border: 1px solid rgba(255, 255, 255, 0.2);
        margin-left: -12px;
		position: relative;
	}

	.agent-avatar-title-overlay {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 10px;
        height: 10px;
        color: #ffffff;
        font-size: 10px;
        font-weight: 200;
        z-index: 1;
	}

	/* Chat bubble style for regular assistant messages */
	.agent-markdown-message.assistant-chat {
		margin: 8px 0;
		align-items: flex-start;
        /* border-top-left-radius: 0; */
	}

	/* Document style for assistant-doc messages */
	.agent-markdown-message.assistant-doc {
		margin: 16px 0;
		align-items: flex-start;
		width: 100%;
        /* border-top-left-radius: 0; */
	}

	@keyframes messageSlideIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.agent-markdown-content {
		width: 100%;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 12px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		position: relative;
		overflow-y: auto;
		max-height: 600px;
		font-size: 12px;
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 40px;
	}

	/* Chat bubble styling for regular assistant messages */
	.agent-markdown-message.assistant-chat .agent-markdown-content {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 12px;
		padding: 8px 12px;
		font-size: 14px;
		line-height: 1.4;
		color: white;
		word-wrap: break-word;
		max-width: 85%;
	}

	/* Override markdown styles for chat bubbles to look like simple text */
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(p) {
		margin: 0;
		color: white;
		font-size: 14px;
		line-height: 1.4;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h1),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h2),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h3),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h4),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h5),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h6) {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 4px 0;
		color: white;
		border: none;
		padding: 0;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(ul),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(ol) {
		margin: 4px 0;
		padding-left: 16px;
		font-size: 14px;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(li) {
		margin: 0;
		color: white;
		font-size: 14px;
		line-height: 1.4;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(strong) {
		color: white;
		font-weight: 600;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(em) {
		color: white;
		font-style: italic;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(code) {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 3px;
		padding: 1px 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 13px;
		color: white;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		border: none;
		border-radius: 4px;
		padding: 8px;
		margin: 4px 0;
		font-size: 13px;
		line-height: 1.3;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(blockquote) {
		border-left: 2px solid rgba(255, 255, 255, 0.3);
		padding-left: 8px;
		margin: 4px 0;
		color: white;
		font-style: italic;
		font-size: 14px;
	}

	/* Document styling for assistant-doc messages */
	.agent-markdown-message.assistant-doc .agent-markdown-content {
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		padding: 12px;
		max-height: 450px;
		font-size: 12px;
		min-height: 40px;
		backdrop-filter: blur(10px);
	}

	/* .agent-markdown-content::before {
        content: '';
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 12px;
        margin: -12px -12px 0 -12px;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.4), transparent);
        pointer-events: none;
        z-index: 1;
    }

    .agent-markdown-content::after {
        content: '';
        position: sticky;
        bottom: 0;
        left: 0;
        right: 0;
        height: 12px;
        margin: 0 -12px -12px -12px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent);
        pointer-events: none;
        z-index: 1;
    } */

	.agent-markdown-streaming {
		position: relative;
		animation: smoothExpand 0.3s ease-out;
		transition: opacity 0.8s ease-in-out;
        padding: 4px;
	}

	.agent-markdown-streaming.streaming {
		/* Additional styling for streaming state if needed */
	}

	/* Animate content as it appears during streaming */
	.agent-markdown-streaming.streaming :global(*) {
		animation: fadeInContent 0.4s ease-out;
	}

	/* Animate new elements as they're added */
	.agent-markdown-streaming :global(p),
	.agent-markdown-streaming :global(h1),
	.agent-markdown-streaming :global(h2),
	.agent-markdown-streaming :global(h3),
	.agent-markdown-streaming :global(h4),
	.agent-markdown-streaming :global(h5),
	.agent-markdown-streaming :global(h6),
	.agent-markdown-streaming :global(ul),
	.agent-markdown-streaming :global(ol),
	.agent-markdown-streaming :global(li),
	.agent-markdown-streaming :global(blockquote),
	.agent-markdown-streaming :global(pre),
	.agent-markdown-streaming :global(table),
	.agent-markdown-streaming :global(code) {
		animation: fadeInElement 0.3s ease-out;
	}

	/* Animate text nodes as they appear */
	.agent-markdown-streaming.streaming :global(span),
	.agent-markdown-streaming.streaming :global(em),
	.agent-markdown-streaming.streaming :global(strong) {
		animation: fadeInText 0.2s ease-out;
	}

	@keyframes smoothExpand {
		from {
			transform: scaleY(0.98);
		}
		to {
			transform: scaleY(1);
		}
	}

	@keyframes fadeInContent {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeInElement {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeInText {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.agent-markdown-time-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	/* Markdown Content Styling */
	.agent-markdown-content :global(h1) {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 10px 0;
		color: rgba(255, 255, 255, 0.98);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 4px;
	}

	.agent-markdown-content :global(h2) {
		font-size: 14px;
		font-weight: 500;
		margin: 16px 0 8px 0;
		color: rgba(255, 255, 255, 0.95);
	}

	.agent-markdown-content :global(h3) {
		font-size: 13px;
		font-weight: 500;
		margin: 12px 0 6px 0;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(p) {
		margin: 0 0 8px 0;
		color: rgba(255, 255, 255, 0.85);
		font-size: 12px;
	}

	.agent-markdown-content :global(ul),
	.agent-markdown-content :global(ol) {
		margin: 0 0 8px 0;
		padding-left: 16px;
		font-size: 12px;
	}

	.agent-markdown-content :global(ul) {
		list-style-type: disc;
		list-style-position: outside;
	}

	.agent-markdown-content :global(ol) {
		list-style-type: decimal;
		list-style-position: outside;
	}

	.agent-markdown-content :global(li) {
		margin: 2px 0;
		color: rgba(255, 255, 255, 0.85);
		display: list-item;
	}

	.agent-markdown-content :global(strong) {
		color: rgba(255, 255, 255, 0.95);
		font-weight: 600;
	}

	.agent-markdown-content :global(em) {
		color: rgba(255, 255, 255, 0.9);
		font-style: italic;
	}

	.agent-markdown-content :global(code) {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 3px;
		padding: 1px 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 10px;
		margin: 8px 0;
		overflow-x: auto;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		line-height: 1.4;
	}

	.agent-markdown-content :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 8px 0;
		font-size: 11px;
	}

	.agent-markdown-content :global(th),
	.agent-markdown-content :global(td) {
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 4px 8px;
		text-align: left;
	}

	.agent-markdown-content :global(th) {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.agent-markdown-content :global(td) {
		color: rgba(255, 255, 255, 0.85);
	}

	.agent-markdown-content :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.2);
		padding-left: 12px;
		margin: 8px 0;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		font-size: 11px;
	}

	.agent-markdown-content :global(hr) {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		margin: 16px 0;
	}

	.agent-markdown-content :global(a) {
		color: rgba(59, 130, 246, 0.9);
		text-decoration: none;
		border-bottom: 1px solid rgba(59, 130, 246, 0.3);
		transition: all 0.2s ease;
	}

	.agent-markdown-content :global(a:hover) {
		color: rgba(59, 130, 246, 1);
		border-bottom-color: rgba(59, 130, 246, 0.8);
	}

	.agent-response-divider {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 16px 0;
		padding: 8px 0;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.25);
		font-weight: 400;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		position: relative;
	}

	.agent-response-divider::before,
	.agent-response-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin: 0 12px;
	}
</style>
