/**
 * LoginScreen — Mobile auth flow mirroring the web app's CommonAuthFlow.
 * Same 4-step logic: language → account → details → otp
 * Connected to the live production backend at ai.croplifescience.com
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Image, StatusBar, Dimensions, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import { languages, loginText, type LanguageCode } from '../../config/i18n';
import { getI18nTranslations } from '../../services/api';
import { COUNTRIES } from '../../config/countries';
import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const { width: W } = Dimensions.get('window');

// ─── Design tokens — matching ai.croplifescience.com green auth theme ───────────
const T = {
  // Auth blue mapped to green as per the latest website CSS
  primary:      '#3e7025',    // --auth-blue on green theme = #4b7f21 / #3e7025
  primaryLight: '#eff7df',    // --auth-sky on green theme
  green:        '#2c6b1f',    // success green
  greenLight:   '#eaf7e4',
  text:         '#1d3322',    // --ink on green theme
  textSub:      '#344c39',
  muted:        '#71806d',
  border:       '#d7e4cf',    // green-tinted borders
  bg:           '#f2f6ed',    // auth-shell background
  card:         '#FFFFFF',
  error:        '#a22b2b',
  errorBg:      '#fff3f3',
  success:      '#2c6b1f',
};

const SOCIAL_OPTIONS = ['WhatsApp', 'Facebook', 'Instagram', 'YouTube', 'Telegram', 'LinkedIn'];
const SOCIAL_ICONS: Record<string, keyof typeof FontAwesome.glyphMap> = {
  'WhatsApp': 'whatsapp',
  'Facebook': 'facebook-square',
  'Instagram': 'instagram',
  'YouTube': 'youtube-play',
  'Telegram': 'telegram',
  'LinkedIn': 'linkedin-square',
};
const SOCIAL_COLORS: Record<string, string> = {
  'WhatsApp': '#25D366',
  'Facebook': '#1877F2',
  'Instagram': '#E1306C',
  'YouTube': '#FF0000',
  'Telegram': '#0088cc',
  'LinkedIn': '#0A66C2',
};

const SOURCE_OPTIONS = ['Dealer', 'Sales Officer', 'Facebook', 'Instagram', 'YouTube', 'WhatsApp', 'Google', 'Friend / Family', 'Other'];

type Step = 'language' | 'account' | 'details' | 'otp';
const STEP_ORDER: Step[] = ['language', 'account', 'details', 'otp'];

type Place = { district: string; state: string; city?: string; latitude: number; longitude: number };
type Dealer = { name: string; owner_name?: string; state?: string; location?: string; registered_mobile?: string; mobile_matches?: boolean };

export default function LoginScreen() {
  const { login } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>('language');
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [remoteT, setRemoteT] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let mounted = true;
    if (loginText[language] && language !== 'en') {
      setRemoteT(null);
      return;
    }
    // Fetch dynamically if missing locally
    getI18nTranslations(language).then(res => {
      if (mounted && res) setRemoteT(res);
    });
    return () => { mounted = false; };
  }, [language]);

  const t = remoteT || loginText[language] || loginText.en;

  // Account
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [countryCode, setCountryCode] = useState('+91');

  // Details
  const [place, setPlace] = useState<Place | null>(null);
  const [social, setSocial] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [isFarmer, setIsFarmer] = useState(false);
  const [isDealerUI, setIsDealerUI] = useState(false);

  // Dealer / referral
  const [dealerCode, setDealerCode] = useState('');
  const [dealer, setDealer] = useState<Dealer | null>(null);
  const [dealerConfirmed, setDealerConfirmed] = useState(false);
  const [dealerError, setDealerError] = useState('');
  const [referral, setReferral] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralError, setReferralError] = useState('');

  // OTP
  const [otp, setOtp] = useState('');

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [promosAccepted, setPromosAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const stepNumber = STEP_ORDER.indexOf(step) + 1;

  const goBack = () => {
    setError('');
    if (step === 'account') setStep('language');
    else if (step === 'details') setStep('account');
    else if (step === 'otp') setStep('details');
  };

  // Auto-verify referral when 7 chars entered
  useEffect(() => {
    const code = referral.trim().toUpperCase();
    if (!isFarmer || code.length !== 7 || referralName) return;
    const timer = setTimeout(() => { void doVerifyReferral(code); }, 450);
    return () => clearTimeout(timer);
  }, [referral, isFarmer]);

  // ─── API calls ────────────────────────────────────────────────────────────
  const captureLocation = async () => {
    setLoading(true); setError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setError('Location permission denied. Allow it and try again.'); return; }
      // 10-second timeout — emulators often cannot get GPS fix
      const locPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000),
      );
      const loc = await Promise.race([locPromise, timeoutPromise]);
      const [geo] = await Location.reverseGeocodeAsync(loc.coords);
      setPlace({
        district: geo?.subregion || geo?.city || '',
        state: geo?.region || '',
        city: geo?.city || '',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (e: any) {
      if (e?.message === 'timeout') {
        setError('Location timed out. On emulators, use the emulator location tool, or the app will use a default location.');
        // Default to a central-India fallback so emulator testing can continue
        setPlace({ district: 'Ahmedabad', state: 'Gujarat', city: 'Ahmedabad', latitude: 23.0225, longitude: 72.5714 });
      } else {
        setError('Could not get location. Try again.');
      }
    }
    finally { setLoading(false); }
  };

  const continueFromAccount = async () => {
    if (firstName.trim().length < 2) return setError('Enter your first name.');
    if (lastName.trim().length < 1) return setError('Enter your last name.');
    if (mobile.replace(/\D/g, '').length !== 10) return setError('Mobile number must be exactly 10 digits.');
    setLoading(true); setError('');
    try {
      const status = await dealerMobileStatus(countryCode + mobile.replace(/\D/g, ''));
      setIsDealerUI(status.is_registered_dealer);
      setIsFarmer(false);
      setReferral(''); setReferralName('');
      setDealerCode(''); setDealer(null); setDealerConfirmed(false);
      setStep('details');
    } catch (e: any) { setError(e.message || 'Something went wrong.'); }
    finally { setLoading(false); }
  };

  const doLookupDealer = async () => {
    setLoading(true); setDealerError(''); setDealer(null); setDealerConfirmed(false);
    try {
      const data = await (await import('../../services/api')).dealerLookup(
        dealerCode.trim(),
        countryCode + mobile.replace(/\D/g, ''),
      );
      setDealer(data.dealer);
    } catch (e: any) { setDealerError(e.message || 'Dealer not found.'); }
    finally { setLoading(false); }
  };

  const doVerifyReferral = async (code: string) => {
    setLoading(true); setReferralError(''); setReferralName('');
    try {
      const data = await referralLookup(code);
      setReferralName(data.dealer.name);
    } catch (e: any) { setReferralError(e.message || 'Invalid referral code.'); }
    finally { setLoading(false); }
  };

  const startOtp = async () => {
    setSubmitAttempted(true); setError('');
    if (!place) return setError('Location is required.');
    if (isDealerUI && (!dealer || !dealerConfirmed)) { setDealerError(dealer ? 'Confirm dealership details to continue.' : 'Enter and verify your dealer code.'); return; }
    if (isFarmer && referral.length === 7 && !referralName) { setReferralError('Enter a valid referral code to continue.'); return; }
    if (!social.length) return setError('Select at least one social media platform.');
    if (!source) return setError('Select where you heard about CLSL AI.');
    if (!termsAccepted) return setError('You must agree to the Terms and Conditions.');
    if (isFarmer && !promosAccepted) return setError('Farmers must agree to receive rewards and promotional messages.');
    setLoading(true);
    try {
      await sendOtp({
        mobile_number: countryCode + mobile.replace(/\D/g, ''),
        first_name: firstName,
        last_name: lastName,
        preferred_language: language,
        ...(isDealerUI && dealerCode ? { dealer_code: dealerCode } : {}),
      });
      setOtp('');
      setStep('otp');
    } catch (e: any) { setError(e.message || 'Failed to send OTP.'); }
    finally { setLoading(false); }
  };

  const finish = async () => {
    if (otp.length !== 6 || !place) return;
    setLoading(true); setError('');
    try {
      const m = countryCode + mobile.replace(/\D/g, '');
      const verified = await verifyOtp(m, otp);
      const role = isDealerUI ? 'dealer' : (isFarmer ? 'farmer' : 'general_user');
      const data = await updateProfile(verified.session_token, {
        role, first_name: firstName, last_name: lastName, preferred_language: language, date_of_birth: dob || null,
        district: place.district, state: place.state, city: place.city || null,
        social_media_used: social, acquisition_source: source,
        referral_code: isFarmer && referral ? referral : null,
        dealer_code: isDealerUI && dealerCode ? dealerCode : null,
        location_latitude: place.latitude, location_longitude: place.longitude,
        location_label: `${place.district}, ${place.state}`,
        location_consent: true,
      });
      await login(verified.session_token, {
        id: verified.user.id,
        first_name: firstName,
        last_name: lastName,
        mobile_number: verified.user.mobile_number,
        role,
        preferred_language: language,
        district: place.district,
        state: place.state,
      });
    } catch (e: any) { setError(e.message || 'Invalid OTP. Try again.'); }
    finally { setLoading(false); }
  };

  const toggleSocial = (item: string) =>
    setSocial(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]);

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderHeader = (title: string, subtitle?: string) => (
    <View style={s.stepHeader}>
      <Text style={s.stepTitle}>{title}</Text>
      {subtitle ? <Text style={s.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  );

  // ── STEP: Language ────────────────────────────────────────────────────────
  const renderLanguage = () => (
    <View>
      <View>
        {renderHeader(t.choose || 'Choose your language', 'Select the language you are most comfortable with.')}
        <View style={s.langGrid}>
          {languages.slice(0, 6).map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[s.langBtn, language === lang.code && s.langBtnActive]}
              onPress={() => setLanguage(lang.code)}
              activeOpacity={0.7}
            >
              <Text style={[s.langBtnName, language === lang.code && s.langBtnNameActive]}>{lang.name}</Text>
              <Text style={[s.langBtnCode, language === lang.code && s.langBtnCodeActive]}>{lang.script}</Text>
              {language === lang.code && (
                <View style={s.langCheck}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.moreLangBtn} onPress={() => { setLangSearch(''); setShowLangModal(true); }}>
          <Text style={s.moreLangBtnText}>More languages</Text>
          <Ionicons name="chevron-down" size={16} color={T.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.welcomeRow}>
        <View style={s.welcomeTextWrap}>
          <Text style={s.welcomeTitle}>{t.welcomeTitle || 'Welcome!'}</Text>
          <Text style={s.welcomeSub}>{t.welcomeSub || "I'm your smart crop doctor, ready to help."}</Text>
        </View>
        <Image source={require('../../../assets/images/mascot_new.png')} style={s.mascotImgSmall} resizeMode="contain" />
      </View>
    </View>
  );

  // ── STEP: Account ─────────────────────────────────────────────────────────
  const renderAccount = () => (
    <View>
      {renderHeader(t.account || 'Join CLSL AI', t.intro || 'Unlock AI crop care, weather, products, rewards, and offers.')}
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.firstName || 'First name'}</Text>
        <TextInput style={s.input} value={firstName} onChangeText={t => { setFirstName(t); setError(''); }} placeholder="Ex. Rajesh" autoCapitalize="words" autoComplete="given-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.lastName || 'Last name'}</Text>
        <TextInput style={s.input} value={lastName} onChangeText={t => { setLastName(t); setError(''); }} placeholder="Ex. Kumar" autoCapitalize="words" autoComplete="family-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>Date of Birth <Text style={{fontSize: 10, color: '#8294A0'}}>(get rewards on your birthday)</Text></Text>
        <TextInput style={s.input} value={dob} onChangeText={t => { setDob(t); setError(''); }} placeholder="DD/MM/YYYY" keyboardType="numeric" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.mobile || 'Mobile number'}</Text>
        <View style={s.phoneRow}>
          <TouchableOpacity style={s.phonePrefix} onPress={() => setShowCountryModal(true)} activeOpacity={0.7}>
            <Text style={s.phonePrefixText}>{COUNTRIES.find(c => c.code === countryCode)?.flag} {countryCode}</Text>
            <Ionicons name="chevron-down" size={14} color={T.primary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <TextInput
            style={[s.input, s.phoneInput]}
            value={mobile}
            onChangeText={t => { setMobile(t.replace(/\D/g, '').slice(0, 10)); setError(''); setIsDealerUI(false); }}
            placeholder={`Enter number without ${countryCode}`}
            keyboardType="number-pad"
            autoComplete="tel"
            maxLength={10}
          />
        </View>
      </View>
    </View>
  );

  // ── STEP: Details ─────────────────────────────────────────────────────────
  const renderDetails = () => (
    <View>
      {renderHeader(t.details || 'Complete your login', t.detailsHelp || 'Current location is required for local weather and crop support.')}

      {/* Location */}
      <TouchableOpacity style={[s.locationCard, place && s.locationCardReady]} onPress={captureLocation} disabled={loading} activeOpacity={0.8}>
        <View style={[s.locationIcon, place && s.locationIconReady]}>
          <MaterialCommunityIcons name={place ? 'check' : 'crosshairs-gps'} size={20} color={place ? T.green : T.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.locationText, place && s.locationTextReady]}>
            {loading ? (t.wait || 'Getting location…') : place ? (t.locationReady || 'Location verified') : (t.location || 'Use my current location')}
          </Text>
          {place && <Text style={s.locationSub}>{place.district}{place.state ? `, ${place.state}` : ''}</Text>}
        </View>
      </TouchableOpacity>

      {/* Social media */}
      <View style={s.fieldsetCard}>
        <Text style={s.fieldsetTitle}>
          {t.social || 'Social media you use'}
          {submitAttempted && !social.length && <Text style={s.requiredBadge}> {t.requiredField || 'Required'}</Text>}
        </Text>
        <View style={s.checkGrid}>
          {SOCIAL_OPTIONS.map(item => (
            <TouchableOpacity key={item} style={[s.checkItem, social.includes(item) && s.checkItemActive]} onPress={() => toggleSocial(item)} activeOpacity={0.7}>
              <View style={[s.checkbox, social.includes(item) && s.checkboxActive]}>
                {social.includes(item) && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome name={SOCIAL_ICONS[item]} size={18} color={SOCIAL_COLORS[item]} />
              </View>
              <Text style={[s.checkLabel, social.includes(item) && s.checkLabelActive]} numberOfLines={1} adjustsFontSizeToFit>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Source */}
      <View style={s.field}>
        <Text style={s.fieldLabel}>
          {t.source || 'Where did you hear about CLSL AI?'}
          {submitAttempted && !source && <Text style={s.requiredBadge}> {t.requiredField || 'Required'}</Text>}
        </Text>
        <TouchableOpacity style={[s.selectBtn, !source && s.selectBtnEmpty]} onPress={() => setShowSourceModal(true)}>
          <Text style={[s.selectBtnText, !source && s.selectBtnPlaceholder]}>{source || (t.selectOne || 'Select one…')}</Text>
          <Ionicons name="chevron-down" size={18} color={T.muted} />
        </TouchableOpacity>
      </View>

      {/* Farmer toggle */}
      {!isDealerUI && (
        <TouchableOpacity style={s.checkCard} onPress={() => { setIsFarmer(!isFarmer); setError(''); }} activeOpacity={0.8}>
          <View style={[s.checkbox, isFarmer && s.checkboxActive]}>
            {isFarmer && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.checkCardTitle}>{t.iAmFarmer || 'I am a farmer'}</Text>
            <Text style={s.checkCardSub}>Select this to receive farmer offers and coupons on CLSL products.</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Dealer banner */}
      {isDealerUI && (
        <View style={s.infoBanner}>
          <MaterialCommunityIcons name="shield-check-outline" size={20} color={T.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.infoBannerTitle}>{t.dealerRecognised || 'Registered dealer mobile recognised'}</Text>
            <Text style={s.infoBannerSub}>{t.dealerRecognisedHelp || 'Enter your private CLSL dealer code below to verify the dealership.'}</Text>
          </View>
        </View>
      )}

      {/* Farmer referral */}
      {isFarmer && !isDealerUI && (
        <View style={s.fieldsetCard}>
          <Text style={s.fieldsetTitle}>{t.referralCode || 'Dealer referral code'} (optional)</Text>
          <Text style={[s.stepSubtitle, { marginBottom: 12, fontSize: 11, color: T.text }]}>Get a referral code from your nearest CLSL dealer to unlock special offers.</Text>
          <TouchableOpacity style={s.qrScanBtn} onPress={async () => { const p = await requestCameraPermission(); if (p.granted) setIsCameraOpen(true); else setError('Camera permission required to scan QR.'); }}>
            <MaterialCommunityIcons name="qrcode-scan" size={18} color={T.primary} />
            <Text style={s.qrScanText}>{t.scanQr || 'Scan referral QR code'}</Text>
          </TouchableOpacity>
          <View style={s.dividerRow}><View style={s.dividerLine} /><Text style={s.dividerText}>{t.orEnterCode || 'or enter the 7-character code'}</Text><View style={s.dividerLine} /></View>
          <View style={s.field}>
            <Text style={s.fieldLabel}>{t.referralCode || 'Dealer referral code'}</Text>
            <TextInput
              style={[s.input, referralError ? s.inputError : null]}
              value={referral}
              onChangeText={t => { setReferral(t.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 7)); setReferralName(''); setReferralError(''); }}
              placeholder="Ex. A7Q2K9M"
              autoCapitalize="characters"
              maxLength={7}
            />
            {referralError ? <Text style={s.fieldError}>{referralError}</Text> : null}
            {referral.length === 7 && loading && !referralName && <Text style={s.statusChecking}>{t.wait || 'Checking code…'}</Text>}
            {referralName ? (
              <View style={s.verifiedRow}>
                <Ionicons name="checkmark-circle" size={16} color={T.green} />
                <Text style={s.verifiedText}>{t.verified || 'Verified'}: {referralName}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Dealer code entry */}
      {isDealerUI && !isFarmer && (
        <View style={s.fieldsetCard}>
          <Text style={s.fieldsetTitle}>{t.dealerCode || 'Dealer code'}</Text>
          <View style={s.dealerRow}>
            <TextInput
              style={[s.input, s.dealerInput, dealerError ? s.inputError : null]}
              value={dealerCode}
              onChangeText={t => { setDealerCode(t.trim().toUpperCase()); setDealer(null); setDealerConfirmed(false); setDealerError(''); }}
              placeholder="Ex. DLR-XXXXXXX"
              autoCapitalize="characters"
            />
            <TouchableOpacity style={[s.verifyBtn, (!dealerCode.trim() || loading) && s.verifyBtnDisabled]} onPress={doLookupDealer} disabled={!dealerCode.trim() || loading}>
              <Text style={s.verifyBtnText}>{loading ? '…' : (t.verify || 'Verify')}</Text>
            </TouchableOpacity>
          </View>
          {dealerError ? <Text style={s.fieldError}>{dealerError}</Text> : null}
          {dealer && (
            <View style={s.dealerCard}>
              <Text style={s.dealerName}>{dealer.name}</Text>
              <View style={s.dealerDetailRow}><Text style={s.dealerDetailLabel}>{t.cityTerritory || 'Location'}</Text><Text style={s.dealerDetailVal}>{dealer.location || dealer.state || '—'}</Text></View>
              <View style={s.dealerDetailRow}><Text style={s.dealerDetailLabel}>{t.owner || 'Owner'}</Text><Text style={s.dealerDetailVal}>{dealer.owner_name || '—'}</Text></View>
              <View style={s.dealerDetailRow}><Text style={s.dealerDetailLabel}>{t.registeredMobile || 'Registered mobile'}</Text><Text style={s.dealerDetailVal}>{dealer.registered_mobile || '—'}</Text></View>
              {dealer.mobile_matches === false ? (
                <Text style={s.dealerWarning}>{t.mobileWarning || `This dealership is registered with a different mobile. Go back and login with ${dealer.registered_mobile}.`}</Text>
              ) : (
                <TouchableOpacity style={[s.confirmBtn, dealerConfirmed && s.confirmBtnDone]} onPress={() => { setDealerError(''); setDealerConfirmed(true); }}>
                  {dealerConfirmed && <Ionicons name="checkmark-circle" size={16} color={T.green} style={{ marginRight: 6 }} />}
                  <Text style={[s.confirmBtnText, dealerConfirmed && { color: T.green }]}>{dealerConfirmed ? (t.dealerConfirmed || 'Details confirmed') : (t.confirmDealer || 'Confirm dealership details')}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      <Text style={s.testNote}>{t.test || 'TEST MODE · OTP: 123456'}</Text>
    </View>
  );

  // ── STEP: OTP ─────────────────────────────────────────────────────────────
  const renderOtp = () => (
    <View>
      {renderHeader(t.otpTitle || 'Verify your mobile', t.otpHelp || 'Testing mode: enter 123456.')}
      <View style={s.otpNumberRow}>
        <MaterialCommunityIcons name="cellphone-message" size={22} color={T.primary} />
        <Text style={s.otpNumber}>{countryCode} {mobile.replace(/\D/g, '')}</Text>
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.otp || '6-digit OTP'}</Text>
        <TextInput
          style={[s.input, s.otpInput]}
          value={otp}
          onChangeText={t => { setOtp(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="1 2 3 4 5 6"
          autoFocus
        />
      </View>
    </View>
  );

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#173b1b" />

      {/* Top brand bar */}
      <View style={s.brandBar}>
        <Image source={require('../../../assets/images/clsl-logo.png')} style={s.brandLogo} resizeMode="contain" />
        <View style={s.brandTextWrap}>
          <Text style={s.brandName}>CLSL AI</Text>
          <Text style={s.brandTagline}>Crop care, made smarter.</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >


          {/* Back button */}
          {step !== 'language' && (
            <TouchableOpacity style={s.backBtn} onPress={goBack}>
              <Ionicons name="arrow-back" size={16} color={T.primary} />
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}

          {/* Steps */}
          <View style={s.stepContent}>
            {step === 'language' && renderLanguage()}
            {step === 'account' && renderAccount()}
            {step === 'details' && renderDetails()}
            {step === 'otp' && renderOtp()}
          </View>

          <View style={{ height: 20 }} />

          {/* Inline CTA Button */}
          {step === 'details' && (
            <View style={{marginTop: 16, marginBottom: 10, gap: 10}}>
              <View style={s.checkCard}>
                <TouchableOpacity onPress={() => setTermsAccepted(!termsAccepted)} style={{padding: 4}}>
                  <View style={[s.checkbox, termsAccepted && s.checkboxActive]}>
                    {termsAccepted && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                </TouchableOpacity>
                <View style={{flex: 1, paddingVertical: 4}}>
                  <Text style={s.checkLabel}>I agree to the <Text style={{color: '#1C402B', fontWeight: '700', textDecorationLine: 'underline'}} onPress={() => setShowTermsModal(true)}>Terms and Conditions</Text> <Text style={s.requiredBadge}>*</Text></Text>
                </View>
              </View>
              
              {isFarmer && (
                <TouchableOpacity style={s.checkCard} onPress={() => setPromosAccepted(!promosAccepted)}>
                  <View style={[s.checkbox, promosAccepted && s.checkboxActive]}>
                    {promosAccepted && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={s.checkLabel}>I agree to receive rewards and promotional messages <Text style={s.requiredBadge}>*</Text></Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
          <View style={s.bottomCtaWrap}>
            {/* Error */}
            {error ? (
              <View style={[s.errorBox, { marginBottom: 10 }]}>
                <Ionicons name="alert-circle-outline" size={16} color={T.error} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[s.primaryBtn, (loading || (step === 'otp' && otp.length !== 6)) && s.primaryBtnDisabled]}
              onPress={() => {
                if (step === 'language') setStep('account');
                else if (step === 'account') continueFromAccount();
                else if (step === 'details') startOtp();
                else if (step === 'otp') finish();
              }}
              disabled={loading || (step === 'otp' && otp.length !== 6)}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {step === 'otp' ? (t.enter || 'Enter CLSL AI') : step === 'details' ? (t.otpButton || 'Continue with OTP') : (t.continue || 'Continue')} →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language picker modal */}
      <Modal visible={showLangModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandleBar} />
            <Text style={s.modalTitle}>More languages</Text>
            <TextInput
              style={s.langSearchInput}
              placeholder="Search language..."
              placeholderTextColor={T.muted}
              value={langSearch}
              onChangeText={setLangSearch}
            />
            <ScrollView>
              {languages
                .filter((l, i) => i >= 6 && (l.name.toLowerCase().includes(langSearch.toLowerCase()) || l.script.toLowerCase().includes(langSearch.toLowerCase())))
                .map(lang => (
                <TouchableOpacity key={lang.code} style={[s.modalItem, language === lang.code && s.modalItemActive]} onPress={() => { setLanguage(lang.code); setShowLangModal(false); }}>
                  <Text style={[s.modalItemText, language === lang.code && s.modalItemTextActive]}>{lang.name} ({lang.script})</Text>
                  {language === lang.code && <Ionicons name="checkmark-circle" size={18} color={T.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowLangModal(false)}>
              <Text style={s.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Country picker modal */}
      <Modal visible={showCountryModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandleBar} />
            <Text style={s.modalTitle}>Select Country Code</Text>
            <View style={s.searchRow}>
              <Ionicons name="search" size={18} color={T.muted} />
              <TextInput style={s.searchInput} placeholder="Search country or code..." value={countrySearch} onChangeText={setCountrySearch} />
            </View>
            <ScrollView>
              {COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.includes(countrySearch)).map((c, i) => (
                <TouchableOpacity key={`${c.code}-${c.name}-${i}`} style={[s.modalItem, countryCode === c.code && s.modalItemActive]} onPress={() => { setCountryCode(c.code); setShowCountryModal(false); }}>
                  <Text style={[s.modalItemText, countryCode === c.code && s.modalItemTextActive]}>{c.flag}  {c.name} ({c.code})</Text>
                  {countryCode === c.code && <Ionicons name="checkmark-circle" size={18} color={T.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowCountryModal(false)}>
              <Text style={s.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Source picker modal */}
      <Modal visible={showSourceModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandleBar} />
            <Text style={s.modalTitle}>How did you hear about CLSL AI?</Text>
            <ScrollView>
              {SOURCE_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[s.modalItem, source === opt && s.modalItemActive]} onPress={() => { setSource(opt); setShowSourceModal(false); }}>
                  <Text style={[s.modalItemText, source === opt && s.modalItemTextActive]}>{opt}</Text>
                  {source === opt && <Ionicons name="checkmark-circle" size={18} color={T.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowSourceModal(false)}>
              <Text style={s.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Camera Modal for QR */}
      <Modal visible={isCameraOpen} animationType="slide">
        {isCameraOpen && (
          <CameraView style={{ flex: 1 }} onBarcodeScanned={async ({ data }) => {
            setIsCameraOpen(false);
            const code = data.trim().toUpperCase().slice(-7);
            setReferral(code);
            setReferralName('');
          }}>
            <View style={s.camOverlay}>
              <TouchableOpacity style={s.camCloseBtn} onPress={() => setIsCameraOpen(false)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <View style={s.camFrame} />
              <Text style={s.camHint}>Point at the dealer referral QR code</Text>
            </View>
          </CameraView>
        )}
      </Modal>

      {/* Terms Modal */}
      <Modal visible={showTermsModal} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E8EEF2' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: '#102A43' }}>Terms & Conditions</Text>
            <TouchableOpacity onPress={() => setShowTermsModal(false)}>
              <Ionicons name="close-circle" size={32} color="#94A5B1" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 14, lineHeight: 24, color: '#334E68' }}>
              Welcome to Crop Life Science Limited (CLSL) AI App. By using this application, you agree to the following terms:{'\n\n'}
              1. **Usage**: This application is provided for informational purposes only. The crop disease predictions, weather advisory, and spray calculations are algorithmic estimates and should not replace professional agricultural consultation.{'\n\n'}
              2. **Privacy & Data**: We value your privacy. We collect basic profile data (name, mobile) and approximate location to provide localized weather and nearest dealer mapping. We do not sell your personal data to third parties.{'\n\n'}
              3. **Promotions**: Farmers who opt-in may receive SMS or WhatsApp notifications containing rewards, promotional offers, and localized weather alerts. You can opt-out by contacting our support hotline.{'\n\n'}
              4. **Liability**: CLSL is not liable for any crop damage, financial loss, or incorrect product application resulting from the use of the tools in this app. Always read the printed label on the physical product before application.{'\n\n'}
              5. **Rewards**: Coupon codes are subject to verification by the local dealer. CLSL reserves the right to withdraw or modify promotional campaigns without prior notice.
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  // Brand bar (top) — matches website's .auth-visual green gradient
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#173b1b',   // greenDark — matches auth-visual gradient start
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(203,233,104,0.15)',
  },
  brandLogo: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', padding: 3 },
  brandTextWrap: { marginLeft: 12 },
  brandName: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  brandTagline: { fontSize: 10, color: '#cce989', fontWeight: '500', marginTop: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 0, flexGrow: 1 },

  // Progress — green segments matching website's .auth-progress
  progressWrap: { marginBottom: 16 },
  progressBarRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: T.border },
  progressSegActive: { backgroundColor: T.primary },
  progressText: { fontSize: 10, fontWeight: '600', color: T.muted, letterSpacing: 0.5 },

  // Back
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 12, color: T.primary, fontWeight: '600' },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: T.errorBg, borderRadius: 10, padding: 12, marginBottom: 16, gap: 8, borderLeftWidth: 3, borderLeftColor: T.error },
  errorText: { flex: 1, fontSize: 12, color: T.error, fontWeight: '500', lineHeight: 20 },

  // Step Content
  stepContent: { paddingTop: 0, paddingBottom: 0 },
  stepHeader: { marginBottom: 22 },
  stepTitle: { fontSize: 22, fontWeight: '900', color: T.text, lineHeight: 30, marginBottom: 6 },
  stepSubtitle: { fontSize: 12, color: T.muted, lineHeight: 21, fontWeight: '500' },

  // Form fields
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: T.textSub, marginBottom: 8, letterSpacing: 0.3 },
  input: { height: 48, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: T.border, borderRadius: 12, paddingHorizontal: 16, fontSize: 14, color: T.text, fontWeight: '600', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  inputError: { borderColor: T.error },
  phoneRow: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  phonePrefix: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: T.border, borderRightWidth: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  phonePrefixText: { fontSize: 14, fontWeight: '700', color: T.text },
  phoneInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, shadowOpacity: 0, elevation: 0 },
  fieldError: { fontSize: 11, color: T.error, fontWeight: '500', marginTop: 5 },

  // Language grid
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4, justifyContent: 'space-between' },
  langBtn: { width: '48%', paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1, position: 'relative' },
  langBtnActive: { borderColor: T.primary, backgroundColor: T.primaryLight },
  langBtnName: { fontSize: 13, fontWeight: '700', color: T.textSub },
  langBtnNameActive: { color: T.primary },
  langBtnCode: { fontSize: 10, color: T.muted, marginTop: 2 },
  langBtnCodeActive: { color: T.primary },
  langCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: T.primary, justifyContent: 'center', alignItems: 'center' },
  moreLangBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  moreLangBtnText: { fontSize: 12, fontWeight: '700', color: T.primary },
  langSearchInput: { height: 44, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 14, fontSize: 13, color: T.text, marginBottom: 12 },

  // Modal specific
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  searchInput: { flex: 1, height: 44, paddingHorizontal: 10, fontSize: 13, color: T.text },

  // Location card
  locationCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: T.border, borderRadius: 12, padding: 14, marginBottom: 16, backgroundColor: T.bg, gap: 12 },
  locationCardReady: { borderColor: T.green, backgroundColor: T.greenLight },
  locationIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: T.primaryLight, justifyContent: 'center', alignItems: 'center' },
  locationIconReady: { backgroundColor: T.greenLight },
  locationText: { fontSize: 13, fontWeight: '700', color: T.primary },
  locationTextReady: { color: T.green },
  locationSub: { fontSize: 11, color: T.green, fontWeight: '500', marginTop: 2 },

  // Fieldset card
  fieldsetCard: { backgroundColor: T.bg, borderWidth: 1.5, borderColor: T.border, borderRadius: 12, padding: 14, marginBottom: 14 },
  fieldsetTitle: { fontSize: 12, fontWeight: '700', color: T.textSub, marginBottom: 14, letterSpacing: 0.3 },

  // Checkboxes
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  checkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1.5, borderColor: T.border, backgroundColor: T.card, gap: 6, width: '48%' },
  checkItemActive: { borderColor: T.primary, backgroundColor: T.primaryLight },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: T.border, justifyContent: 'center', alignItems: 'center', backgroundColor: T.card },
  checkboxActive: { backgroundColor: T.primary, borderColor: T.primary },
  checkLabel: { fontSize: 12, fontWeight: '600', color: T.textSub, flexShrink: 1 },
  checkLabelActive: { color: T.primary },
  requiredBadge: { color: T.error, fontWeight: '700' },

  // Select button
  selectBtn: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: T.border, borderRadius: 12, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  selectBtnEmpty: { borderColor: T.border },
  selectBtnText: { fontSize: 14, fontWeight: '500', color: T.text },
  selectBtnPlaceholder: { color: T.muted },

  // Farmer checkbox card
  checkCard: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5, borderColor: T.border, borderRadius: 12, padding: 14, marginBottom: 14, backgroundColor: T.card },
  checkCardTitle: { fontSize: 13, fontWeight: '700', color: T.text },
  checkCardSub: { fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 19 },

  // Info banner
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: T.primaryLight, borderRadius: 12, padding: 14, marginBottom: 14, gap: 10, borderLeftWidth: 3, borderLeftColor: T.primary },
  infoBannerTitle: { fontSize: 12, fontWeight: '700', color: T.primary, marginBottom: 3 },
  infoBannerSub: { fontSize: 11, color: T.textSub, lineHeight: 19 },

  // QR scan
  qrScanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.primary, backgroundColor: T.primaryLight, borderRadius: 12, padding: 14, gap: 8, marginBottom: 12 },
  qrScanText: { fontSize: 13, fontWeight: '700', color: T.primary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { fontSize: 10, color: T.muted, fontWeight: '500' },

  // Dealer row
  dealerRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dealerInput: { flex: 1 },
  verifyBtn: { backgroundColor: T.primary, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  verifyBtnDisabled: { opacity: 0.4 },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dealerCard: { backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, padding: 14, marginTop: 4 },
  dealerName: { fontSize: 15, fontWeight: '800', color: T.text, marginBottom: 10 },
  dealerDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dealerDetailLabel: { fontSize: 11, color: T.muted, fontWeight: '500' },
  dealerDetailVal: { fontSize: 11, fontWeight: '700', color: T.textSub },
  dealerWarning: { fontSize: 11, color: T.error, marginTop: 8, lineHeight: 19 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.border, borderRadius: 8, padding: 12, marginTop: 10 },
  confirmBtnDone: { borderColor: T.green, backgroundColor: T.greenLight },
  confirmBtnText: { fontSize: 12, fontWeight: '700', color: T.textSub },

  // Verified
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  verifiedText: { fontSize: 12, fontWeight: '700', color: T.green },
  statusChecking: { fontSize: 11, color: T.muted, marginTop: 6 },

  // Test note
  testNote: { fontSize: 10, color: T.muted, textAlign: 'center', marginTop: 10, fontWeight: '500' },

  // OTP
  otpNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  otpNumber: { fontSize: 18, fontWeight: '800', color: T.text },
  otpInput: { fontSize: 26, letterSpacing: 12, textAlign: 'center', fontWeight: '700', height: 64 },

  // Bottom CTA
  bottomCtaWrap: { paddingBottom: Platform.OS === 'ios' ? 34 : 24, paddingTop: 12, backgroundColor: 'transparent' },
  
  // Primary button — green with lime-tinted shadow like website
  primaryBtn: {
    backgroundColor: T.primary,
    borderRadius: 12, height: 54,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  // Source modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: T.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, maxHeight: '75%' },
  modalHandleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: T.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: T.text, marginBottom: 16 },
  modalItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalItemActive: { backgroundColor: T.primaryLight, marginHorizontal: -20, paddingHorizontal: 20 },
  modalItemText: { fontSize: 14, color: T.textSub, fontWeight: '500' },
  modalItemTextActive: { color: T.primary, fontWeight: '700' },
  modalCloseBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  modalCloseBtnText: { fontSize: 14, color: T.muted, fontWeight: '600' },

  // Camera
  camOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  camCloseBtn: { position: 'absolute', top: 52, right: 24, backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 20 },
  camFrame: { width: 250, height: 250, borderWidth: 3, borderColor: '#fff', borderRadius: 14 },
  camHint: { color: '#fff', marginTop: 20, fontSize: 13, fontWeight: '600' },

  // Mascot & Welcome Row
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 20, marginBottom: -4, zIndex: 10 },
  welcomeTextWrap: { flex: 1, paddingBottom: 36, paddingRight: 10 },
  welcomeTitle: { fontSize: 26, fontWeight: '900', color: T.primary, marginBottom: 6 },
  welcomeSub: { fontSize: 15, color: T.textSub, fontWeight: '700', lineHeight: 22 },
  mascotImgSmall: { width: 165, height: 165 },
});
