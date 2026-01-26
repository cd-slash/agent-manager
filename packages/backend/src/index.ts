import path from "node:path"
import { serve } from "bun"

const isProduction = process.env.NODE_ENV === "production"
const frontendDistPath = path.resolve(import.meta.dir, "../../frontend/dist")

const server = serve({
	port: 3001,

	// Serve static files from frontend dist in production
	static: isProduction ? frontendDistPath : undefined,

	routes: {
		"/health": new Response("OK"),
	},

	fetch(_req) {
		// Fallback handler for unmatched routes
		return new Response("Not Found", { status: 404 })
	},

	development: !isProduction && {
		hmr: true,
		console: true,
	},
})

console.log(`Backend server running at ${server.url}`)
