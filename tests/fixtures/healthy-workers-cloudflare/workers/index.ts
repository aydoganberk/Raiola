export default {
  async fetch(request, _env, ctx) {
    ctx.waitUntil(Promise.resolve());
    console.log(request.url);
    return new Response('ok');
  },
};
