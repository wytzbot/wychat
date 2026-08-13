import { getServerSubscription } from "./payments.js";

export async function refreshSubscription(getIdToken, onState){
  try{
    const state=await getServerSubscription(getIdToken);
    onState?.(state);
    document.documentElement.dataset.plan=state.plan;
    document.documentElement.dataset.ads=state.ads ? "on" : "off";
    return state;
  }catch(error){
    onState?.({plan:"free",subscriptionStatus:"unknown",ads:true,error:error.message});
    return null;
  }
}
