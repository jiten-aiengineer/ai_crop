import React, { useState } from 'react';

type AuthFlowProps = {
  onComplete: (token: string, requiresOnboarding: boolean) => void;
  t: Record<string, string>;
};

export function AuthFlow({ onComplete, t }: AuthFlowProps) {
  const [step, setStep] = useState<'mobile' | 'otp' | 'role' | 'details'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [role, setRole] = useState('');
  const [name, setName] = useState('');
  const [crop, setCrop] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionToken, setSessionToken] = useState('');

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    let number = mobile.trim();
    if (!number.startsWith('+')) {
      number = '+91' + number;
    }
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: number })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP');
      setMobile(number);
      setStep('otp');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile_number: mobile, otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Invalid OTP');
      
      setSessionToken(data.session_token);
      localStorage.setItem('clsl_auth_token', data.session_token);

      if (data.requires_onboarding) {
        setStep('role');
      } else {
        onComplete(data.session_token, false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitRole = async (selectedRole: string) => {
    setRole(selectedRole);
    setStep('details');
  };

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/role', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ role, name, crop, location })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to save profile');
      }
      onComplete(sessionToken, true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-slate-950 z-50 flex flex-col pt-12 px-6 overflow-y-auto">
      <div className="max-w-md w-full mx-auto flex-1 flex flex-col">
        <h1 className="text-2xl font-semibold mb-2">CLSL AI</h1>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

        {step === 'mobile' && (
          <form onSubmit={sendOtp} className="flex-1 flex flex-col">
            <h2 className="text-xl font-medium mb-6">Enter your mobile number</h2>
            <div className="mb-4">
              <label className="block text-sm text-slate-500 mb-1">Mobile Number</label>
              <input 
                type="tel"
                value={mobile}
                onChange={e => setMobile(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full text-lg p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900"
                required
              />
            </div>
            <p className="text-sm text-slate-500 mb-6">We will send you an OTP to verify your number.</p>
            <div className="mt-auto pb-6">
              <button disabled={loading || mobile.length < 10} type="submit" className="w-full bg-green-600 text-white font-medium p-4 rounded-xl disabled:opacity-50">
                {loading ? 'Sending...' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={verifyOtp} className="flex-1 flex flex-col">
            <h2 className="text-xl font-medium mb-6">Verify Mobile</h2>
            <p className="text-slate-600 mb-6">OTP sent to {mobile}</p>
            <div className="mb-4">
              <label className="block text-sm text-slate-500 mb-1">Enter OTP</label>
              <input 
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="123456"
                className="w-full text-lg p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 tracking-widest text-center"
                required
                maxLength={6}
              />
            </div>
            <div className="mt-auto pb-6">
              <button disabled={loading || otp.length < 4} type="submit" className="w-full bg-green-600 text-white font-medium p-4 rounded-xl disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </div>
          </form>
        )}

        {step === 'role' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-2xl font-semibold mb-2">Tell us about yourself</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8">This helps us personalize CLSL AI for you.</p>
            
            <div className="space-y-4">
              <button onClick={() => submitRole('Farmer')} className="w-full text-left p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                <div className="font-medium text-lg">Farmer</div>
                <div className="text-sm text-slate-500 mt-1">I grow crops and want to diagnose issues.</div>
              </button>
              
              <button onClick={() => submitRole('Dealer')} className="w-full text-left p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                <div className="font-medium text-lg">Dealer / Retailer</div>
                <div className="text-sm text-slate-500 mt-1">I sell CLSL products.</div>
              </button>
              
              <button onClick={() => submitRole('General User')} className="w-full text-left p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                <div className="font-medium text-lg">General User</div>
                <div className="text-sm text-slate-500 mt-1">I am just exploring CLSL AI.</div>
              </button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={saveDetails} className="flex-1 flex flex-col">
            <h2 className="text-xl font-medium mb-6">Complete your profile</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-500 mb-1">Your Name</label>
                <input 
                  type="text" value={name} onChange={e => setName(e.target.value)} required
                  className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900"
                />
              </div>
              
              {role === 'Farmer' && (
                <>
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Primary Crop Gown</label>
                    <input 
                      type="text" value={crop} onChange={e => setCrop(e.target.value)} required
                      className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Farming Location (Village/City)</label>
                    <input 
                      type="text" value={location} onChange={e => setLocation(e.target.value)} required
                      className="w-full p-3 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mt-auto pb-6">
              <button disabled={loading || !name} type="submit" className="w-full bg-green-600 text-white font-medium p-4 rounded-xl mt-6 disabled:opacity-50">
                {loading ? 'Saving...' : 'Finish Setup'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
