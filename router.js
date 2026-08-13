export function route() {
  const parts=location.pathname.split("/").filter(Boolean);
  if(parts[0]==="q" && parts[1]) return {name:"room",key:parts[1]};
  if(parts[0]==="signin") return {name:"signin"};
  if(parts[0]==="pricing") return {name:"pricing"};
  if(["privacy","security","safety","terms","how-it-works"].includes(parts[0])) return {name:parts[0]};
  return {name:"home"};
}