import { Client } from "../src/index.ts"

Deno.test("initialize client", t => {
  new Client({ auth: "foo" })
})
