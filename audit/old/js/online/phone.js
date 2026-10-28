// Phone identities are real E.164 identifiers, never fabricated email aliases.
export function normalizePhone(value){
 let v=String(value||'').trim().replace(/[\s()-]/g,'');
 if(/^[6-9]\d{9}$/.test(v))v='+91'+v;
 if(!/^\+[1-9]\d{7,14}$/.test(v))throw Error('Enter a mobile number with country code, e.g. +91 9876543210 / நாடு குறியீட்டுடன் மொபைல் எண்ணை உள்ளிடுங்கள்');
 return v;
}
export function normalizeContact(value){const v=String(value||'').trim();if(v.includes('@')){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||v.length>254)throw Error('Invalid email / மின்னஞ்சலைச் சரிபாருங்கள்');return v.toLowerCase();}return normalizePhone(v);}
export async function phoneEnabled(config,fetcher=fetch){
 const r=await fetcher(config.projectUrl.replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:config.publishableKey},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Could not check SMS service / SMS சேவையைச் சரிபார்க்க முடியவில்லை');
 const settings=await r.json();return settings.external?.phone===true;
}
export function phoneError(e,ta=false){
 const code=e?.code||'',message=e?.message||'';
 if(code==='otp_expired'||/token.*expired|invalid.*token/i.test(message))return ta?'OTP தவறு அல்லது காலாவதியானது. மீண்டும் முயற்சிக்கவும்.':'OTP is invalid or expired. Try again.';
 if(e?.status===429||/rate|too.many|after.*seconds/i.test(code+' '+message))return ta?'சிறிது நேரம் கழித்து மீண்டும் OTP கேளுங்கள்.':'Please wait before requesting another OTP.';
 if(/phone_provider_disabled|sms_send_failed/.test(code))return ta?'SMS சேவை இன்னும் தயாராகவில்லை. Email மூலம் உள்நுழையலாம்.':'SMS service is not ready. You can sign in with email.';
 return ta?'செயலை முடிக்க முடியவில்லை. எண்ணையும் இணைய இணைப்பையும் சரிபாருங்கள்.':'Could not complete this step. Check your number and connection.';
}
