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
import DateTimePicker from '@react-native-community/datetimepicker';
import { languages, loginText, type LanguageCode } from '../../config/i18n';
import { getI18nTranslations } from '../../services/api';
import { COUNTRIES } from '../../config/countries';
import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup, dealerLookup, checkPhone } from '../../services/api';
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

type Step = 'language' | 'phone' | 'dealer_code' | 'details' | 'otp';
const STEP_ORDER: Step[] = ['language', 'phone', 'dealer_code', 'details', 'otp'];

type Place = { district: string; state: string; city?: string; latitude: number; longitude: number };
type Dealer = { name: string; owner_name?: string; state?: string; location?: string; registered_mobile?: string; mobile_matches?: boolean };

export default function LoginScreen() {
  const { login } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>('language');
  const [role, setRole] = useState<'farmer' | 'dealer' | 'sales_officer' | 'general_user'>('farmer');
  const [isNewUser, setIsNewUser] = useState(false);
  
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
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDobDate(selectedDate);
      const d = String(selectedDate.getDate()).padStart(2, '0');
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const y = selectedDate.getFullYear();
      setDob(`${d}/${m}/${y}`);
      setError('');
    }
  };

  // Details
  const [place, setPlace] = useState<Place | null>(null);
  const [social, setSocial] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [isFarmer, setIsFarmer] = useState(false);
  const [isDealerUI, setIsDealerUI] = useState(false);
  const [isSalesOfficer, setIsSalesOfficer] = useState(false);

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
    if (step === 'phone') setStep('language');
    else if (step === 'details') setStep('phone');
    else if (step === 'dealer_code') setStep('phone');
    else if (step === 'otp') { if (isNewUser) setStep('details'); else if (role === 'dealer') setStep('dealer_code'); else setStep('phone'); }
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
    setError('');
    setStep('details');
  };

  const doLookupDealer = async () => {
    setLoading(true); setDealerError(''); setDealer(null); setDealerConfirmed(false);
    try {
      const data = await dealerLookup(
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

  
  const continueFromPhone = async () => {
    if (!mobile || mobile.length < 10) {
      setError(t.error_mobile || 'Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      const checkRes = await checkPhone(fullMobile).catch(() => ({ exists: false, role: 'farmer' as const }));
      if (checkRes.exists) {
        setRole(checkRes.role || 'farmer');
        setIsNewUser(false);
        if (checkRes.role === 'dealer') {
          // If dealer, must enter dealer code first
          setStep('dealer_code');
        } else {
          // Farmer or Sales Officer: jump straight to OTP
          await sendOtp({ mobile_number: fullMobile });
          setStep('otp');
        }
      } else {
        // New User -> Must be a Farmer signing up (Dealers/SO are added by admin)
        setRole('farmer');
        setIsNewUser(true);
        setStep('details'); // Collect name, state, etc.
      }
    } catch (e: any) {
      setError(e.message || 'Error checking phone number');
    }
    setLoading(false);
  };

  const verifyDealerCode = async () => {
    if (!dealerCode) {
      setError('Please enter your dealer code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      await sendOtp({ mobile_number: fullMobile, dealer_code: dealerCode });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Invalid dealer code');
    }
    setLoading(false);
  };

  const startOtpForNewUser = async () => {
    if (!firstName) {
      setError(t.error_firstname || 'First Name is required');
      return;
    }
    // New user signing up
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      await sendOtp({ mobile_number: fullMobile, is_new: true });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Error sending OTP');
    }
    setLoading(false);
  };


  const finish = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setError('');
    try {
      const m = countryCode + mobile.replace(/\D/g, '');
      const verified = await verifyOtp(m, otp);
      
      let finalRole = role; // role from checkPhone state
      let finalFirst = verified.user.first_name || firstName;
      let finalLast = (verified.user as any).last_name || lastName;
      let finalDistrict = (verified.user as any).district || (place ? place.district : null);
      let finalState = (verified.user as any).state || (place ? place.state : null);
      let verifiedDealerId = (verified.user as any).verified_dealer_id || null;

      if (isNewUser && place) {
        const data = await updateProfile(verified.session_token, {
          role: finalRole, first_name: firstName, last_name: lastName, preferred_language: language, date_of_birth: dob || null,
          district: place.district, state: place.state, city: place.city || null,
          social_media_used: social, acquisition_source: source,
          referral_code: finalRole === 'farmer' && referral ? referral : null,
          dealer_code: finalRole === 'dealer' && dealerCode ? dealerCode : null,
          location_latitude: place.latitude, location_longitude: place.longitude,
          location_label: `${place.district}, ${place.state}`,
          location_consent: true,
        });
        if (data && data.user) {
           finalFirst = (data.user as any).first_name || finalFirst;
           finalLast = (data.user as any).last_name || finalLast;
           finalDistrict = (data.user as any).district || finalDistrict;
           finalState = (data.user as any).state || finalState;
           verifiedDealerId = (data.user as any).verified_dealer_id || verifiedDealerId;
        }
      } else if (finalRole === 'dealer' && dealerCode && !verifiedDealerId) {
        const data = await updateProfile(verified.session_token, { dealer_code: dealerCode });
        if (data && data.user) verifiedDealerId = (data.user as any).verified_dealer_id;
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
        // @ts-ignore
        verified_dealer_id: verifiedDealerId
      });
    } catch (e: any) {
      setError(e.message || t.error_otp || 'Invalid code. Try again.');
    }
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
        <Image source={require('../../../assets/images/mascot_v3.png')} style={[s.mascotImgSmall, { aspectRatio: 1 }]} resizeMode="contain" />
      </View>
    </View>
  );

  // ── STEP: Account ─────────────────────────────────────────────────────────
  
  const renderPhone = () => (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>{t.mobileLabel || 'Mobile Number'}</Text>
      <Text style={s.stepSubtitle}>Enter your phone number to login or sign up.</Text>
      <View style={s.mobileInputContainer}>
        <TouchableOpacity style={s.countryCodeBox} onPress={() => setShowCountryModal(true)}>
            <Text style={s.countryCodeText}>
              {COUNTRIES.find(c => c.code === countryCode)?.flag || '????'} {countryCode}
            </Text>
          </TouchableOpacity>
        <TextInput
          style={s.mobileInput}
          value={mobile}
          onChangeText={(v) => { setMobile(v.replace(/[^0-9]/g, '')); setError(''); }}
          placeholder="9876543210"
          keyboardType="phone-pad"
          maxLength={10}
          placeholderTextColor={T.muted}
        />
      </View>
    </View>
  );

  const renderDealerCode = () => (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Dealer Code</Text>
      <Text style={s.stepSubtitle}>Please verify your identity by entering your CLSL Dealer Code.</Text>
      <TextInput
        style={s.input}
        value={dealerCode}
        onChangeText={(v) => { setDealerCode(v); setError(''); }}
        placeholder="e.g. DL12345"
        placeholderTextColor={T.muted}
      />
    </View>
  );

  const renderAccount = () => ( // keeping to avoid syntax errors if referenced elsewhere

    <View>
      {renderHeader(t.account || 'Join CLSL AI', t.intro || 'Unlock AI crop care, weather, products, rewards, and offers.')}
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.firstName || 'First name'}</Text>
        <TextInput style={s.input} value={firstName} onChangeText={t => { setFirstName(t); setError(''); }} placeholder="Ex. Rahul" autoCapitalize="words" autoComplete="given-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.lastName || 'Last name'}</Text>
        <TextInput style={s.input} value={lastName} onChangeText={t => { setLastName(t); setError(''); }} placeholder="Ex. Sharma" autoCapitalize="words" autoComplete="family-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>Date of Birth <Text style={{fontSize: 10, color: '#8294A0'}}>(get rewards on your birthday)</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput 
            style={[s.input, { flex: 1, paddingRight: 45 }]} 
            value={dob} 
            onChangeText={t => { 
              let cleaned = t.replace(/\D/g, '');
              if (cleaned.length > 2) {
                let m = parseInt(cleaned.slice(2, 4));
                if (m > 12) cleaned = cleaned.slice(0, 2) + '12' + cleaned.slice(4);
                if (cleaned.slice(2, 4) === '00') cleaned = cleaned.slice(0, 2) + '01' + cleaned.slice(4);
              }
              if (cleaned.length >= 2) {
                let d = parseInt(cleaned.slice(0, 2));
                if (d > 31) cleaned = '31' + cleaned.slice(2);
                if (cleaned.slice(0, 2) === '00') cleaned = '01' + cleaned.slice(2);
              }
              let formatted = cleaned;
              if (cleaned.length > 2) formatted = cleaned.slice(0,2) + '/' + cleaned.slice(2);
              if (cleaned.length > 4) formatted = formatted.slice(0,5) + '/' + cleaned.slice(4,8);
              setDob(formatted);
              setError('');
            }} 
            placeholder="DD/MM/YYYY" 
            keyboardType="numeric" 
            maxLength={10} 
          />
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ position: 'absolute', right: 15, height: '100%', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={22} color={T.primary} />
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={dobDate || new Date()}
            mode="date"
            display="default"
            onValueChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}
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
      {!isDealerUI && !isSalesOfficer && (
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
      {isDealerUI && !isSalesOfficer && (
        <View style={s.infoBanner}>
          <MaterialCommunityIcons name="shield-check-outline" size={20} color={T.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.infoBannerTitle}>{t.dealerRecognised || 'Registered dealer mobile recognised'}</Text>
            <Text style={s.infoBannerSub}>{t.dealerRecognisedHelp || 'Enter your private CLSL dealer code below to verify the dealership.'}</Text>
          </View>
        </View>
      )}

      {/* Farmer referral */}
      {isFarmer && !isDealerUI && !isSalesOfficer && (
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
      {isDealerUI && !isFarmer && !isSalesOfficer && (
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

      {/* Sales Officer banner */}
      {isSalesOfficer && (
        <View style={s.infoBanner}>
          <MaterialCommunityIcons name="badge-account" size={20} color={T.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.infoBannerTitle}>Sales Officer Verified</Text>
            <Text style={s.infoBannerSub}>You are logging in as a CLSL Sales Officer.</Text>
          </View>
        </View>
      )}

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
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top brand bar */}
      <View style={s.brandBar}>
        <Image source={require('../../../assets/images/clsl-logo-leaf.png')} style={s.brandLogo} resizeMode="contain" />
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
            {step === 'phone' && renderPhone()}
            {step === 'dealer_code' && renderDealerCode()}
            {step === 'details' && renderDetails()}
            {step === 'otp' && renderOtp()}
          </View>

          {/* Inline CTA Button */}
          {step === 'details' && (
            <View style={{marginBottom: 10, gap: 10}}>
              <TouchableOpacity activeOpacity={0.8} style={[s.checkCard, { alignItems: 'center', paddingVertical: 18, marginBottom: 0 }]} onPress={() => setTermsAccepted(!termsAccepted)}>
                <View style={[s.checkbox, termsAccepted && s.checkboxActive]}>
                  {termsAccepted && <Ionicons name="checkmark" size={12} color="#FFF" />}
                </View>
                <View style={{flex: 1, marginLeft: 12}}>
                  <Text style={[s.checkCardTitle, { fontSize: 13 }]}>
                    I agree to the <Text style={{color: T.primary, textDecorationLine: 'underline'}} onPress={(e) => { e.stopPropagation(); setShowTermsModal(true); }}>Terms and Conditions</Text> <Text style={s.requiredBadge}>*</Text>
                  </Text>
                </View>
              </TouchableOpacity>
              
              {isFarmer && (
                <TouchableOpacity activeOpacity={0.8} style={[s.checkCard, { alignItems: 'center', paddingVertical: 18 }]} onPress={() => setPromosAccepted(!promosAccepted)}>
                  <View style={[s.checkbox, promosAccepted && s.checkboxActive]}>
                    {promosAccepted && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <View style={{flex: 1, marginLeft: 12}}>
                    <Text style={[s.checkCardTitle, { fontSize: 13 }]}>I agree to receive rewards and promotional messages <Text style={s.requiredBadge}>*</Text></Text>
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
                if (step === 'language') setStep('phone');
                else if (step === 'phone') continueFromPhone();
                else if (step === 'dealer_code') verifyDealerCode();
                else if (step === 'details') startOtpForNewUser();
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
          <View style={{ flex: 1 }}>
            <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={async ({ data }) => {
              setIsCameraOpen(false);
              const code = data.trim().toUpperCase().slice(-7);
              setReferral(code);
              setReferralName('');
            }} />
            <View style={[s.camOverlay, StyleSheet.absoluteFill]}>
              <TouchableOpacity style={s.camCloseBtn} onPress={() => setIsCameraOpen(false)}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <View style={s.camFrame} />
              <Text style={s.camHint}>Point at the dealer referral QR code</Text>
            </View>
          </View>
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

  // Brand bar (top)
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 48 : 32,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  brandLogo: { width: 36, height: 36 },
  brandTextWrap: { marginLeft: 8 },
  brandName: { fontSize: 18, fontWeight: '900', color: '#0B4783', letterSpacing: 0.5 },
  brandTagline: { fontSize: 10, color: '#0B4783', fontWeight: '600', marginTop: 1 },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, flexGrow: 1, justifyContent: 'flex-start' },

  // Progress — green segments matching website's .auth-progress
  progressWrap: { marginBottom: 12 },
  progressBarRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: T.border },
  progressSegActive: { backgroundColor: T.primary },
  // Added missing styles for Auth Flow
  stepContainer: { paddingVertical: 20 },

  mobileInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 12, overflow: 'hidden' },
  countryCodeBox: { backgroundColor: T.primaryLight, paddingHorizontal: 16, height: 56, justifyContent: 'center', borderRightWidth: 1, borderRightColor: T.border },
  countryCodeText: { fontSize: 16, fontWeight: '700', color: T.primary },
  mobileInput: { flex: 1, height: 56, fontSize: 18, fontWeight: '700', paddingHorizontal: 16, color: T.text },
  progressText: { fontSize: 9, fontWeight: '600', color: T.muted, letterSpacing: 0.5 },

  // Back
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 11, color: T.primary, fontWeight: '600' },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: T.errorBg, borderRadius: 8, padding: 10, marginBottom: 12, gap: 8, borderLeftWidth: 3, borderLeftColor: T.error },
  errorText: { flex: 1, fontSize: 11, color: T.error, fontWeight: '500', lineHeight: 18 },

  // Step Content
  stepContent: { paddingTop: 0, paddingBottom: 0 },
  stepHeader: { marginBottom: 16 },
  stepTitle: { fontSize: 24, fontWeight: '900', color: T.text, lineHeight: 30, marginBottom: 6 },
  stepSubtitle: { fontSize: 13, color: T.muted, lineHeight: 20, fontWeight: '500' },

  // Form fields
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '800', color: T.textSub, marginBottom: 8, letterSpacing: 0.3 },
  input: { height: 48, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: T.text, fontWeight: '600', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2, elevation: 1 },
  inputError: { borderColor: T.error },
  phoneRow: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
  phonePrefix: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: T.border, borderRightWidth: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  phonePrefixText: { fontSize: 15, fontWeight: '700', color: T.text },
  phoneInput: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, shadowOpacity: 0, elevation: 0 },
  fieldError: { fontSize: 11, color: T.error, fontWeight: '500', marginTop: 5 },

  // Language grid
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8, justifyContent: 'space-between' },
  langBtn: { width: '48%', paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2, elevation: 1, position: 'relative' },
  langBtnActive: { borderColor: T.primary, backgroundColor: T.primaryLight },
  langBtnName: { fontSize: 14, fontWeight: '700', color: T.textSub },
  langBtnNameActive: { color: T.primary },
  langBtnCode: { fontSize: 11, color: T.muted, marginTop: 2 },
  langBtnCodeActive: { color: T.primary },
  langCheck: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: T.primary, justifyContent: 'center', alignItems: 'center' },
  moreLangBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2, elevation: 1 },
  moreLangBtnText: { fontSize: 13, fontWeight: '700', color: T.primary },
  langSearchInput: { height: 40, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 12, color: T.text, marginBottom: 12 },

  // Modal specific
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, borderRadius: 10, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  searchInput: { flex: 1, height: 44, paddingHorizontal: 10, fontSize: 13, color: T.text },

  // Location card
  locationCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 14, marginBottom: 16, backgroundColor: T.bg, gap: 12 },
  locationCardReady: { borderColor: T.green, backgroundColor: T.greenLight },
  locationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.primaryLight, justifyContent: 'center', alignItems: 'center' },
  locationIconReady: { backgroundColor: T.greenLight },
  locationText: { fontSize: 14, fontWeight: '800', color: T.primary },
  locationTextReady: { color: T.green },
  locationSub: { fontSize: 12, color: T.green, fontWeight: '600', marginTop: 2 },

  // Fieldset card
  fieldsetCard: { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 16, marginBottom: 16 },
  fieldsetTitle: { fontSize: 13, fontWeight: '800', color: T.textSub, marginBottom: 12, letterSpacing: 0.3 },

  // Checkboxes
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  checkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, gap: 6, width: '48%' },
  checkItemActive: { borderColor: T.primary, backgroundColor: T.primaryLight },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: T.border, justifyContent: 'center', alignItems: 'center', backgroundColor: T.card },
  checkboxActive: { backgroundColor: T.primary, borderColor: T.primary },
  checkLabel: { fontSize: 11, fontWeight: '600', color: T.textSub, flexShrink: 1 },
  checkLabelActive: { color: T.primary },
  requiredBadge: { color: T.error, fontWeight: '700' },

  // Select button
  selectBtn: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2, elevation: 1 },
  selectBtnEmpty: { borderColor: T.border },
  selectBtnText: { fontSize: 15, fontWeight: '600', color: T.text },
  selectBtnPlaceholder: { color: T.muted },

  // Farmer checkbox card
  checkCard: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 16, marginBottom: 16, backgroundColor: T.card },
  checkCardTitle: { fontSize: 14, fontWeight: '800', color: T.text },
  checkCardSub: { fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 18 },

  // Info banner
  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: T.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12, gap: 8, borderLeftWidth: 3, borderLeftColor: T.primary },
  infoBannerTitle: { fontSize: 11, fontWeight: '700', color: T.primary, marginBottom: 2 },
  infoBannerSub: { fontSize: 10, color: T.textSub, lineHeight: 16 },

  // QR scan
  qrScanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.primary, backgroundColor: T.primaryLight, borderRadius: 10, padding: 12, gap: 6, marginBottom: 10 },
  qrScanText: { fontSize: 12, fontWeight: '700', color: T.primary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.border },
  dividerText: { fontSize: 9, color: T.muted, fontWeight: '500' },

  // Dealer row
  dealerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  dealerInput: { flex: 1 },
  verifyBtn: { backgroundColor: T.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  verifyBtnDisabled: { opacity: 0.4 },
  verifyBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  dealerCard: { backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border, padding: 12, marginTop: 4 },
  dealerName: { fontSize: 14, fontWeight: '800', color: T.text, marginBottom: 8 },
  dealerDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  dealerDetailLabel: { fontSize: 10, color: T.muted, fontWeight: '500' },
  dealerDetailVal: { fontSize: 10, fontWeight: '700', color: T.textSub },
  dealerWarning: { fontSize: 10, color: T.error, marginTop: 6, lineHeight: 16 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border, borderRadius: 6, padding: 10, marginTop: 8 },
  confirmBtnDone: { borderColor: T.green, backgroundColor: T.greenLight },
  confirmBtnText: { fontSize: 11, fontWeight: '700', color: T.textSub },

  // Verified
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  verifiedText: { fontSize: 11, fontWeight: '700', color: T.green },
  statusChecking: { fontSize: 10, color: T.muted, marginTop: 4 },

  // Test note
  testNote: { fontSize: 9, color: T.muted, textAlign: 'center', marginTop: 8, fontWeight: '500' },

  // OTP
  otpNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  otpNumber: { fontSize: 16, fontWeight: '800', color: T.text },
  otpInput: { fontSize: 22, letterSpacing: 10, textAlign: 'center', fontWeight: '700', height: 56 },

  // Bottom CTA
  bottomCtaWrap: { paddingBottom: Platform.OS === 'ios' ? 24 : 16, paddingTop: 8, backgroundColor: 'transparent' },
  
  // Primary button — green with lime-tinted shadow like website
  primaryBtn: {
    backgroundColor: T.primary,
    borderRadius: 10, height: 48,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: T.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },

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
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 24, marginBottom: -4, zIndex: 10 },
  welcomeTextWrap: { flex: 1, paddingBottom: 24, paddingRight: 8 },
  welcomeTitle: { fontSize: 26, fontWeight: '900', color: T.primary, marginBottom: 4 },
  welcomeSub: { fontSize: 14, color: T.textSub, fontWeight: '700', lineHeight: 20 },
  mascotImgSmall: { width: 170, height: 170 },
});
