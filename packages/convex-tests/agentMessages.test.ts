/**
 * Agent Messages - Structured Streaming Storage Tests
 *
 * Tests the structured message storage system including:
 * - Message creation with content parsing
 * - Tool use/result parsing
 * - Text content extraction
 * - Batch creation
 * - Query operations
 */

import { describe, expect, it } from "bun:test"
import { api } from "../convex/_generated/api"
import schema from "../convex/schema"
import { createConvexTest } from "./setup"

describe("agentMessages", () => {
	describe("create - text content", () => {
		it("should create a text message from plain string", async () => {
			const t = await createConvexTest(schema)

			const messageId = await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Hello, world!",
				sequenceNumber: 0,
			})

			expect(messageId).toBeDefined()

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages.length).toBe(1)
			expect(messages[0]?.messageType).toBe("text")
			expect(messages[0]?.text).toBe("Hello, world!")
		})

		it("should create a result message with result streamType", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				streamType: "result",
				content: "Final result text",
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("result")
			expect(messages[0]?.text).toBe("Final result text")
		})

		it("should parse JSON string content", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: JSON.stringify({
					type: "text",
					content: [{ type: "text", text: "Parsed from JSON" }],
				}),
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("text")
		})
	})

	describe("create - tool_use content", () => {
		it("should parse tool_use from object content", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: {
					type: "tool_use",
					content_block: {
						type: "tool_use",
						id: "tool_abc123",
						name: "Bash",
					},
				},
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("tool_use")
			expect(messages[0]?.toolId).toBe("tool_abc123")
			expect(messages[0]?.toolName).toBe("Bash")
		})

		it("should parse tool_use from content array", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: {
					content: [
						{
							type: "tool_use",
							id: "tool_xyz789",
							name: "Read",
							input: { file_path: "/test/file.txt" },
						},
					],
				},
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("tool_use")
			expect(messages[0]?.toolId).toBe("tool_xyz789")
			expect(messages[0]?.toolName).toBe("Read")
			expect(messages[0]?.toolInput).toEqual({ file_path: "/test/file.txt" })
		})
	})

	describe("create - tool_result content", () => {
		it("should parse tool_result from object content", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: {
					type: "tool_result",
					tool_use_id: "tool_abc123",
					content: [{ type: "text", text: "File contents here" }],
					is_error: false,
				},
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("tool_result")
			expect(messages[0]?.toolId).toBe("tool_abc123")
			expect(messages[0]?.toolResult).toEqual([
				{ type: "text", text: "File contents here" },
			])
			expect(messages[0]?.isError).toBe(false)
		})

		it("should mark error tool results", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: {
					type: "tool_result",
					tool_use_id: "tool_abc123",
					content: [{ type: "text", text: "Command failed: not found" }],
					is_error: true,
				},
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("tool_result")
			expect(messages[0]?.isError).toBe(true)
		})
	})

	describe("create - text content array", () => {
		it("should extract text from content array", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: {
					content: [
						{ type: "text", text: "First part. " },
						{ type: "text", text: "Second part." },
					],
				},
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("text")
			expect(messages[0]?.text).toBe("First part. Second part.")
		})
	})

	describe("createStructured", () => {
		it("should create pre-parsed structured message", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_use",
				toolName: "Write",
				toolId: "tool_write_1",
				toolInput: { file_path: "/new/file.ts", content: "code here" },
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("tool_use")
			expect(messages[0]?.toolName).toBe("Write")
			expect(messages[0]?.toolInput).toEqual({
				file_path: "/new/file.ts",
				content: "code here",
			})
		})

		it("should create error message", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "error",
				text: "Something went wrong",
				isError: true,
				sequenceNumber: 0,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages[0]?.messageType).toBe("error")
			expect(messages[0]?.text).toBe("Something went wrong")
			expect(messages[0]?.isError).toBe(true)
		})
	})

	describe("createBatch", () => {
		it("should create multiple messages in batch", async () => {
			const t = await createConvexTest(schema)

			const result = await t.mutation(api.agentMessages.createBatch, {
				messages: [
					{ sessionId: "session-123", content: "Message 1", sequenceNumber: 0 },
					{ sessionId: "session-123", content: "Message 2", sequenceNumber: 1 },
					{ sessionId: "session-123", content: "Message 3", sequenceNumber: 2 },
				],
			})

			expect(result.created).toBe(3)
			expect(result.ids.length).toBe(3)

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages.length).toBe(3)
		})

		it("should assign unique timestamps to batch messages", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createBatch, {
				messages: [
					{ sessionId: "session-123", content: "Message 1", sequenceNumber: 0 },
					{ sessionId: "session-123", content: "Message 2", sequenceNumber: 1 },
					{ sessionId: "session-123", content: "Message 3", sequenceNumber: 2 },
				],
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			// Timestamps should be unique (slightly incremented)
			const timestamps = messages.map((m) => m.timestamp)
			const uniqueTimestamps = new Set(timestamps)
			expect(uniqueTimestamps.size).toBe(3)
		})
	})

	describe("queries", () => {
		it("should get messages by session ordered by sequence", async () => {
			const t = await createConvexTest(schema)

			// Create messages out of order
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Third",
				sequenceNumber: 2,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "First",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Second",
				sequenceNumber: 1,
			})

			const messages = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})

			expect(messages.length).toBe(3)
			expect(messages[0]?.text).toBe("First")
			expect(messages[1]?.text).toBe("Second")
			expect(messages[2]?.text).toBe("Third")
		})

		it("should get only tool calls", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "text",
				text: "Some text",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_use",
				toolName: "Bash",
				sequenceNumber: 1,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_result",
				toolId: "tool_1",
				sequenceNumber: 2,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "text",
				text: "More text",
				sequenceNumber: 3,
			})

			const toolCalls = await t.query(api.agentMessages.getToolCalls, {
				sessionId: "session-123",
			})

			expect(toolCalls.length).toBe(2)
			expect(toolCalls[0]?.messageType).toBe("tool_use")
			expect(toolCalls[1]?.messageType).toBe("tool_result")
		})

		it("should get latest messages with limit", async () => {
			const t = await createConvexTest(schema)

			for (let i = 0; i < 30; i++) {
				await t.mutation(api.agentMessages.create, {
					sessionId: "session-123",
					content: `Message ${i}`,
					sequenceNumber: i,
				})
			}

			const latest = await t.query(api.agentMessages.getLatest, {
				sessionId: "session-123",
				limit: 5,
			})

			expect(latest.length).toBe(5)
			// Should be in chronological order (oldest to newest of the last 5)
		})

		it("should get messages by type", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "text",
				text: "Text 1",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "thinking",
				text: "Thinking...",
				sequenceNumber: 1,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "text",
				text: "Text 2",
				sequenceNumber: 2,
			})

			const thinking = await t.query(api.agentMessages.getByType, {
				sessionId: "session-123",
				messageType: "thinking",
			})

			expect(thinking.length).toBe(1)
			expect(thinking[0]?.text).toBe("Thinking...")
		})

		it("should get message count", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Message 1",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Message 2",
				sequenceNumber: 1,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-456",
				content: "Different session",
				sequenceNumber: 0,
			})

			const count = await t.query(api.agentMessages.getCount, {
				sessionId: "session-123",
			})

			expect(count).toBe(2)
		})

		it("should get session summary", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "text",
				text: "Hello",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_use",
				toolName: "Bash",
				sequenceNumber: 1,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_result",
				toolId: "t1",
				sequenceNumber: 2,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "tool_use",
				toolName: "Read",
				sequenceNumber: 3,
			})
			await t.mutation(api.agentMessages.createStructured, {
				sessionId: "session-123",
				messageType: "error",
				text: "Error occurred",
				isError: true,
				sequenceNumber: 4,
			})

			const summary = await t.query(api.agentMessages.getSessionSummary, {
				sessionId: "session-123",
			})

			expect(summary.totalMessages).toBe(5)
			expect(summary.byType.text).toBe(1)
			expect(summary.byType.tool_use).toBe(2)
			expect(summary.byType.tool_result).toBe(1)
			expect(summary.byType.error).toBe(1)
			expect(summary.toolsUsed).toContain("Bash")
			expect(summary.toolsUsed).toContain("Read")
			expect(summary.hasErrors).toBe(true)
		})

		it("should paginate messages", async () => {
			const t = await createConvexTest(schema)

			for (let i = 0; i < 20; i++) {
				await t.mutation(api.agentMessages.create, {
					sessionId: "session-123",
					content: `Message ${i}`,
					sequenceNumber: i,
				})
			}

			const page1 = await t.query(api.agentMessages.getBySessionPaginated, {
				sessionId: "session-123",
				limit: 5,
			})

			expect(page1.messages.length).toBe(5)
			expect(page1.isDone).toBe(false)
			expect(page1.nextCursor).toBeDefined()

			const page2 = await t.query(api.agentMessages.getBySessionPaginated, {
				sessionId: "session-123",
				limit: 5,
				cursor: page1.nextCursor,
			})

			expect(page2.messages.length).toBe(5)
		})
	})

	describe("deletion", () => {
		it("should delete all messages for a session", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Message 1",
				sequenceNumber: 0,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-123",
				content: "Message 2",
				sequenceNumber: 1,
			})
			await t.mutation(api.agentMessages.create, {
				sessionId: "session-456",
				content: "Other session",
				sequenceNumber: 0,
			})

			const result = await t.mutation(api.agentMessages.deleteBySession, {
				sessionId: "session-123",
			})

			expect(result.deleted).toBe(2)

			const remaining = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-123",
			})
			expect(remaining.length).toBe(0)

			const otherSession = await t.query(api.agentMessages.getBySession, {
				sessionId: "session-456",
			})
			expect(otherSession.length).toBe(1)
		})
	})
})
