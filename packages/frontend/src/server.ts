import index from "./index.html";

const server = Bun.serve({
  routes: {
    "/*": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Frontend dev server running at ${server.url}`);
