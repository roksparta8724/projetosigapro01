import {describe,expect,it,vi} from "vitest";
import handler from "../../api/neon-auth-email";
describe("Neon Auth webhook is valid deployable TypeScript",()=>{
 it("is importable and does not expose email handlers via GET",async()=>{
  let reply:Record<string,unknown>={};
  const req={method:"GET",headers:{},url:"/api/neon-auth-email"};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((s:string)=>{reply=JSON.parse(s)})};
  await handler(req as never,res as never);
  expect(res.statusCode).toBe(405);
  expect(reply).toMatchObject({error:"Method not allowed"});
  expect(res.setHeader).toHaveBeenCalledWith("Allow","POST");
 });
});
