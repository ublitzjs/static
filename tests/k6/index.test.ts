import {describe, it, beforeAll, afterAll} from "vitest";
import {exec} from "node:child_process";
import { end, start, port } from "./server";
beforeAll(()=>{
  start()
})
afterAll(()=>{
  end();
});
describe("high load testing", {concurrent: true, sequential: false}, ()=>{
  it("works", {timeout: 12 * 1000}, async ()=>{
    await new Promise<void>((resolve, reject)=>{
      exec("k6 run " + import.meta.dirname + "/k6-entrypoint.ts -e PORT="+port+" -e ENDPOINT=100mb" , (error, stdout)=>{
        if(error) reject(error)
        console.info("k6 100mb: ",stdout);
        resolve();
      })
    });
  });

});
