import http from "k6/http";
import {check} from "k6";
import {Options} from "k6/options";
declare var __ENV: Record<string, string>;
var endpoint = __ENV.ENDPOINT!; //also means size of file
var port = __ENV.PORT!;

export var options: Options = {
  duration: '2s',
  vus: 5,
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate==0'],
  }
} 
var size = String(1024*1024*100)
export default ()=>{
  var res = http.get("http://localhost:" + port + '/' + endpoint);
  if(!check(res, {
    'request succeeded': (r)=>r.status === 200,
    "request size == 100mb": (r)=>r.headers["Content-Length"] == size 
  })) throw new Error("REQUEST FAILED")
}
