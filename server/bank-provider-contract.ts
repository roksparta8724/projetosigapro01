/** Provider money must be explicitly returned, not substituted from a local guide. */
export function exactProviderCents(value:unknown):number|null{
 const text=typeof value==="string"||typeof value==="number"?String(value):"";
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text))return null;
 const [major,minor=""]=text.split(".");
 const cents=Number(major)*100+Number(minor.padEnd(2,"0"));
 return Number.isSafeInteger(cents)&&cents>0?cents:null;
}
export function isProviderId(value:unknown):value is string{
 return typeof value==="string"&&/^[A-Za-z0-9_-]{6,100}$/.test(value);
}
