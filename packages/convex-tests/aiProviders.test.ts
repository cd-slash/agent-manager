/**
 * AI Providers - Provider Management Tests
 *
 * Tests the AI provider management system including:
 * - Provider creation and defaults
 * - Model enable/disable
 * - Provider authentication status
 * - Seeding builtin providers
 */

import { describe, expect, it } from "bun:test"
import { api } from "../convex/_generated/api"
import schema from "../convex/schema"
import { createConvexTest } from "./setup"

describe("aiProviders", () => {
	describe("seedBuiltinProviders", () => {
		it("should seed default providers", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.aiProviders.seedBuiltinProviders, {})

			const providers = await t.query(api.aiProviders.list, {})

			expect(providers.length).toBeGreaterThanOrEqual(3)

			// Check Anthropic provider
			const anthropic = providers.find((p) => p.type === "anthropic")
			expect(anthropic).toBeDefined()
			expect(anthropic?.name).toBe("Anthropic")
			expect(anthropic?.enabled).toBe(true)
			expect(anthropic?.authType).toBe("oauth")
			expect(anthropic?.isBuiltin).toBe(true)
			expect(anthropic?.models.length).toBeGreaterThan(0)

			// Check OpenAI provider
			const openai = providers.find((p) => p.type === "openai")
			expect(openai).toBeDefined()
			expect(openai?.enabled).toBe(false)
			expect(openai?.authType).toBe("api_key")

			// Check Google provider
			const google = providers.find((p) => p.type === "google")
			expect(google).toBeDefined()
			expect(google?.enabled).toBe(false)
		})

		it("should not duplicate providers on re-seed", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.aiProviders.seedBuiltinProviders, {})
			const countBefore = (await t.query(api.aiProviders.list, {})).length

			await t.mutation(api.aiProviders.seedBuiltinProviders, {})
			const countAfter = (await t.query(api.aiProviders.list, {})).length

			expect(countAfter).toBe(countBefore)
		})
	})

	describe("create", () => {
		it("should create a custom provider", async () => {
			const t = await createConvexTest(schema)

			const providerId = await t.mutation(api.aiProviders.create, {
				name: "Custom LLM",
				type: "custom",
				enabled: true,
				authType: "api_key",
				apiKeySecretKey: "CUSTOM_LLM_API_KEY",
				models: [
					{ id: "custom-model-1", name: "Custom Model 1", enabled: true },
					{ id: "custom-model-2", name: "Custom Model 2", enabled: false },
				],
			})

			expect(providerId).toBeDefined()

			const provider = await t.query(api.aiProviders.get, { id: providerId })
			expect(provider?.name).toBe("Custom LLM")
			expect(provider?.type).toBe("custom")
			expect(provider?.isBuiltin).toBe(false)
			expect(provider?.models.length).toBe(2)
		})
	})

	describe("update", () => {
		it("should update provider settings", async () => {
			const t = await createConvexTest(schema)

			const providerId = await t.mutation(api.aiProviders.create, {
				name: "Test Provider",
				type: "custom",
				enabled: false,
				authType: "api_key",
				models: [{ id: "test-model", name: "Test Model", enabled: true }],
			})

			await t.mutation(api.aiProviders.update, {
				id: providerId,
				enabled: true,
				name: "Updated Provider Name",
			})

			const provider = await t.query(api.aiProviders.get, { id: providerId })
			expect(provider?.enabled).toBe(true)
			expect(provider?.name).toBe("Updated Provider Name")
		})
	})

	describe("toggleEnabled", () => {
		it("should toggle provider enabled state", async () => {
			const t = await createConvexTest(schema)

			const providerId = await t.mutation(api.aiProviders.create, {
				name: "Test Provider",
				type: "custom",
				enabled: false,
				authType: "api_key",
				models: [{ id: "test-model", name: "Test Model", enabled: true }],
			})

			await t.mutation(api.aiProviders.toggleEnabled, { id: providerId })

			let provider = await t.query(api.aiProviders.get, { id: providerId })
			expect(provider?.enabled).toBe(true)

			await t.mutation(api.aiProviders.toggleEnabled, { id: providerId })

			provider = await t.query(api.aiProviders.get, { id: providerId })
			expect(provider?.enabled).toBe(false)
		})
	})

	describe("toggleModelEnabled", () => {
		it("should toggle specific model enabled state", async () => {
			const t = await createConvexTest(schema)

			const providerId = await t.mutation(api.aiProviders.create, {
				name: "Test Provider",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [
					{ id: "model-1", name: "Model 1", enabled: true },
					{ id: "model-2", name: "Model 2", enabled: false },
				],
			})

			await t.mutation(api.aiProviders.toggleModelEnabled, {
				providerId: providerId,
				modelId: "model-1",
			})

			const provider = await t.query(api.aiProviders.get, { id: providerId })
			const model1 = provider?.models.find((m) => m.id === "model-1")
			expect(model1?.enabled).toBe(false)
		})
	})

	describe("queries", () => {
		it("should get enabled providers only", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.aiProviders.create, {
				name: "Enabled Provider",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [{ id: "test-model", name: "Test Model", enabled: true }],
			})

			await t.mutation(api.aiProviders.create, {
				name: "Disabled Provider",
				type: "custom",
				enabled: false,
				authType: "api_key",
				models: [{ id: "test-model", name: "Test Model", enabled: true }],
			})

			const enabled = await t.query(api.aiProviders.getEnabled, {})

			expect(enabled.length).toBe(1)
			expect(enabled[0]?.name).toBe("Enabled Provider")
		})

		it("should get flat list of enabled models", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.aiProviders.create, {
				name: "Provider 1",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [
					{ id: "p1-model-1", name: "P1 Model 1", enabled: true },
					{ id: "p1-model-2", name: "P1 Model 2", enabled: false },
				],
			})

			await t.mutation(api.aiProviders.create, {
				name: "Provider 2",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [
					{ id: "p2-model-1", name: "P2 Model 1", enabled: true },
				],
			})

			const models = await t.query(api.aiProviders.getEnabledModels, {})

			expect(models.length).toBe(2)
			expect(models.some((m) => m.id === "p1-model-1")).toBe(true)
			expect(models.some((m) => m.id === "p2-model-1")).toBe(true)
			// Disabled model should not be included
			expect(models.some((m) => m.id === "p1-model-2")).toBe(false)
		})

		it("should get models grouped by provider", async () => {
			const t = await createConvexTest(schema)

			await t.mutation(api.aiProviders.create, {
				name: "Provider A",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [
					{ id: "a-1", name: "A Model 1", enabled: true },
					{ id: "a-2", name: "A Model 2", enabled: true },
				],
			})

			await t.mutation(api.aiProviders.create, {
				name: "Provider B",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [
					{ id: "b-1", name: "B Model 1", enabled: true },
				],
			})

			const grouped = await t.query(api.aiProviders.getEnabledModelsGrouped, {})

			expect(grouped.length).toBe(2)
			const providerA = grouped.find((g) => g.providerName === "Provider A")
			const providerB = grouped.find((g) => g.providerName === "Provider B")

			expect(providerA?.models.length).toBe(2)
			expect(providerB?.models.length).toBe(1)
		})
	})

	describe("remove", () => {
		it("should delete a provider", async () => {
			const t = await createConvexTest(schema)

			const providerId = await t.mutation(api.aiProviders.create, {
				name: "To Delete",
				type: "custom",
				enabled: true,
				authType: "api_key",
				models: [{ id: "test-model", name: "Test Model", enabled: true }],
			})

			await t.mutation(api.aiProviders.remove, { id: providerId })

			const provider = await t.query(api.aiProviders.get, { id: providerId })
			expect(provider).toBeNull()
		})
	})
})
