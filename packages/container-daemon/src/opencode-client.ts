export type OpencodeModel = {
	id: string
	name?: string
	capabilities?: string[]
	provider?: string
}

export type OpencodeEvent = {
	type: string
	properties?: Record<string, unknown>
}

export type OpencodeMessagePart = {
	id?: string
	type?: string
	text?: string
	name?: string
	input?: unknown
	content?: unknown
	is_error?: boolean
}

export type OpencodeMessageResponse = {
	info?: {
		id?: string
	}
	parts?: OpencodeMessagePart[]
}

export type OpencodeModelSelection = {
	providerID: string
	modelID: string
}

export class OpencodeClient {
	private baseUrl: string

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/$/, "")
	}

	async createSession(title?: string): Promise<string> {
		const response = await fetch(`${this.baseUrl}/session`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(title ? { title } : {}),
		})

		if (!response.ok) {
			throw new Error(`OpenCode session create failed: ${response.statusText}`)
		}

		const data = (await response.json()) as Record<string, unknown>
		const id =
			(data.id as string | undefined) ||
			((data.session as { id?: string } | undefined)?.id ?? "")

		if (!id) {
			throw new Error("OpenCode session create did not return an id")
		}

		return id
	}

	async sendMessage(
		sessionId: string,
		options: {
			parts: Array<{ type: string; text: string }>
			model?: OpencodeModelSelection
			system?: string
			tools?: Record<string, unknown>
			noReply?: boolean
		},
	): Promise<OpencodeMessageResponse> {
		const response = await fetch(
			`${this.baseUrl}/session/${sessionId}/message`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					parts: options.parts,
					model: options.model,
					system: options.system,
					tools: options.tools,
					noReply: options.noReply,
				}),
			},
		)

		if (!response.ok) {
			const text = await response.text()
			throw new Error(`OpenCode message failed: ${response.status} ${text}`)
		}

		return (await response.json()) as OpencodeMessageResponse
	}

	async abortSession(sessionId: string): Promise<void> {
		const response = await fetch(`${this.baseUrl}/session/${sessionId}/abort`, {
			method: "POST",
		})

		if (!response.ok) {
			throw new Error(`OpenCode abort failed: ${response.statusText}`)
		}
	}

	async listModels(): Promise<OpencodeModel[]> {
		const response = await fetch(`${this.baseUrl}/zen/v1/models`)
		if (!response.ok) {
			throw new Error(`OpenCode models failed: ${response.statusText}`)
		}

		const data = (await response.json()) as unknown
		if (Array.isArray(data)) return data as OpencodeModel[]
		if (Array.isArray((data as { models?: unknown }).models)) {
			return (data as { models: OpencodeModel[] }).models
		}
		return []
	}

	async getDiff(sessionId: string, messageId?: string): Promise<unknown> {
		const url = new URL(`${this.baseUrl}/session/${sessionId}/diff`)
		if (messageId) url.searchParams.set("messageID", messageId)
		const response = await fetch(url.toString())
		if (!response.ok) {
			throw new Error(`OpenCode diff failed: ${response.statusText}`)
		}
		return await response.json()
	}

	async *subscribeEvents(signal?: AbortSignal): AsyncGenerator<OpencodeEvent> {
		const response = await fetch(`${this.baseUrl}/event`, {
			headers: { Accept: "text/event-stream" },
			signal,
		})

		if (!response.ok || !response.body) {
			throw new Error(`OpenCode event stream failed: ${response.statusText}`)
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		while (true) {
			const { value, done } = await reader.read()
			if (done) break

			buffer += decoder.decode(value, { stream: true })
			const chunks = buffer.split("\n\n")
			buffer = chunks.pop() || ""

			for (const chunk of chunks) {
				const lines = chunk.split("\n")
				for (const line of lines) {
					if (!line.startsWith("data:")) continue
					const raw = line.slice(5).trim()
					if (!raw) continue
					try {
						const event = JSON.parse(raw) as OpencodeEvent
						if (event?.type) {
							yield event
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		}
	}
}
