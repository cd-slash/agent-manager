import { OpencodeClient } from "./opencode-client"

export type OpencodeExecutionOptions = {
	prompt: string
	providerId: string
	modelId: string
	systemPrompt?: string
	sessionId?: string
}

export type OpencodeStreamEvent = {
	type: "start" | "data" | "error" | "done"
	sessionId?: string
	data?: unknown
	error?: string
}

export class OpencodeRunner {
	private client: OpencodeClient

	constructor(baseUrl: string) {
		this.client = new OpencodeClient(baseUrl)
	}

	async *executeStream(
		options: OpencodeExecutionOptions,
	): AsyncGenerator<OpencodeStreamEvent> {
		const sessionId = options.sessionId || (await this.client.createSession())

		yield { type: "start", sessionId }

		let eventAbort: AbortController | null = null
		try {
			eventAbort = new AbortController()
			const eventStream = this.client.subscribeEvents(eventAbort.signal)

			const messagePromise = this.client.sendMessage(sessionId, {
				parts: [{ type: "text", text: options.prompt }],
				model: { providerID: options.providerId, modelID: options.modelId },
				system: options.systemPrompt,
			})

			const messageResult = await messagePromise
			if (messageResult) {
				yield {
					type: "data",
					sessionId,
					data: { type: "message.response", messageResult },
				}
			}

			for await (const event of eventStream) {
				const properties = event.properties || {}
				const eventSessionId = (properties.sessionID || properties.id) as
					| string
					| undefined
				if (eventSessionId && eventSessionId !== sessionId) continue

				yield { type: "data", sessionId, data: event }
				if (event.type === "session.completed") {
					break
				}
			}

			yield { type: "done", sessionId }
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			yield { type: "error", sessionId, error: message }
		} finally {
			if (eventAbort) {
				eventAbort.abort()
			}
		}
	}

	async abort(sessionId: string): Promise<void> {
		await this.client.abortSession(sessionId)
	}

	async getDiff(sessionId: string, messageId?: string): Promise<unknown> {
		return await this.client.getDiff(sessionId, messageId)
	}
}
