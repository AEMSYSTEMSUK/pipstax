const http = require("http");
const next = require("next");

const port = Number(process.env.PORT || 3000);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Tenant app listening on ${port}`);
  });
});
