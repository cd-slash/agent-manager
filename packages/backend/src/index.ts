import { serve } from "bun";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const frontendDistPath = path.resolve(import.meta.dir, "../../frontend/dist");

const server = serve({
  port: 3001,
  routes: {
    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  // Serve static files from frontend dist in production
  static: isProduction ? frontendDistPath : undefined,

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

console.log(`Backend server running at ${server.url}`);
