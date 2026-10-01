import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx_start = content.find("const finish = async () => {")
idx_end = content.find("};", idx_start) + 2

new_finish = '''const finish = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setError('');
    try {
      const m = countryCode + mobile.replace(/\D/g, '');
      const verified = await verifyOtp(m, otp);
      
      let finalRole = role; // role comes from checkPhone
      let finalFirst = verified.user.first_name || firstName;
      let finalLast = verified.user.last_name || lastName;
      let finalDistrict = verified.user.district || (place ? place.district : null);
      let finalState = verified.user.state || (place ? place.state : null);
      let verifiedDealerId = verified.user.verified_dealer_id || null;

      // Only update profile if new user, or if we collected new data
      if (isNewUser && place) {
        const data = await updateProfile(verified.session_token, {
          role: finalRole, first_name: firstName, last_name: lastName, preferred_language: language, date_of_birth: dob || null,
          district: place.district, state: place.state, city: place.city || null,
          social_media_used: social, acquisition_source: source,
          referral_code: finalRole === 'farmer' && referral ? referral : null,
          dealer_code: finalRole === 'dealer' && dealerCode ? dealerCode : null,
          location_latitude: place.latitude, location_longitude: place.longitude,
          location_label: ${place.district}, ,
          location_consent: true,
        });
        if (data && data.user) {
           finalFirst = data.user.first_name || finalFirst;
           finalLast = data.user.last_name || finalLast;
           finalDistrict = data.user.district || finalDistrict;
           finalState = data.user.state || finalState;
           verifiedDealerId = data.user.verified_dealer_id || verifiedDealerId;
        }
      } else if (finalRole === 'dealer' && dealerCode && !verifiedDealerId) {
        // Just verify the dealer code link
        const data = await updateProfile(verified.session_token, {
          dealer_code: dealerCode,
        });
        if (data && data.user) {
          verifiedDealerId = data.user.verified_dealer_id;
        }
      }

      await login(verified.session_token, {
        id: verified.user.id,
        first_name: finalFirst,
        last_name: finalLast,
        mobile_number: verified.user.mobile_number,
        role: finalRole,
        preferred_language: language,
        district: finalDistrict,
        state: finalState,
        verified_dealer_id: verifiedDealerId
      });
    } catch (e: any) {
      setError(e.message || t.error_otp || 'Invalid code. Try again.');
    }
    finally { setLoading(false); }
  };'''

content = content[:idx_start] + new_finish + content[idx_end:]

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched finish")
