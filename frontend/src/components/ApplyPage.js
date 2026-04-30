import React, { useState } from 'react';
import axios from 'axios';

const API = '';

const SERVICES_LIST = [
  { id: 'data-entry',      label: 'Data Entry & Capture',     icon: '📊' },
  { id: 'transcription',  label: 'Transcription',              icon: '🎙' },
  { id: 'translation',    label: 'Translation Services',       icon: '🌐' },
  { id: 'virtual-assistant', label: 'Virtual Assistant',       icon: '💼' },
  { id: 'customer-support',  label: 'Customer Support',        icon: '🎧' },
  { id: 'finance-admin',  label: 'Finance & Admin Support',    icon: '📈' },
  { id: 'content-moderation', label: 'Content Moderation',    icon: '🛡' },
  { id: 'reporting',      label: 'Reporting & Analytics',      icon: '📋' },
  { id: 'document-processing', label: 'Document Processing',  icon: '📄' },
  { id: 'social-media',   label: 'Social Media Management',   icon: '📱' },
];

const TIERS = [
  { amount: 250,  earn: 500 },
  { amount: 500,  earn: 1000 },
  { amount: 1000, earn: 2000 },
  { amount: 2500, earn: 5000 },
  { amount: 5000, earn: 10000 },
];

const ZAR = n => `R ${(parseFloat(n) || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', phone: '', location: '',
    desired_earnings: 500,
    services: [],
    experience: '',
    availability: 'flexible',
    equipment: '',
    internet_speed: '',
    penalty_acknowledged: false,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleService = id => {
    set('services', form.services.includes(id)
      ? form.services.filter(s => s !== id)
      : [...form.services, id]
    );
  };

  const earn = form.desired_earnings * 2;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.penalty_acknowledged) {
      setError('Please confirm that you have read and accepted the Subcontractor Agreement Terms.');
      return;
    }
    if (form.services.length === 0) {
      setError('Please select at least one service you can perform.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await axios.post(`${API}/api/subcontractors/applications`, {
        ...form,
        services: form.services.map(id => SERVICES_LIST.find(s => s.id === id)?.label || id),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Submission failed. Please try again or email us directly.');
    }
    setSending(false);
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '56px 48px', maxWidth: 560, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🎉</div>
          <h1 style={{ margin: '0 0 16px', fontSize: 28, fontWeight: 800, color: '#0f172a' }}>Application Received!</h1>
          <p style={{ margin: '0 0 24px', fontSize: 16, color: '#475569', lineHeight: 1.7 }}>
            Thank you, <strong>{form.name}</strong>! Your application has been submitted successfully. Our team will review it within <strong>24–48 hours</strong> and contact you at <strong>{form.email}</strong> with your approval status and payment details.
          </p>
          <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1 }}>Your Earning Summary</p>
            <p style={{ margin: 0, fontSize: 15, color: '#166534' }}>
              Enrolment Investment: <strong>{ZAR(form.desired_earnings)}</strong><br />
              Contracts You'll Receive: <strong style={{ fontSize: 18 }}>{ZAR(earn)}</strong>
            </p>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Questions? Email us at <a href="mailto:cts.bposolutions@gmail.com" style={{ color: '#6366f1' }}>cts.bposolutions@gmail.com</a></p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#0f3460 100%)' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', padding: '40px 24px 0' }}>
        <img src="/cts-bpo-logo-nobg.png" alt="CTS BPO" style={{ height: 80, width: 'auto', marginBottom: 16 }} />
        <h1 style={{ margin: '0 0 8px', color: '#fff', fontSize: 28, fontWeight: 800 }}>Subcontractor Application</h1>
        <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: 14 }}>Join South Africa's fastest-growing BPO partner network</p>
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', background: 'rgba(56,189,248,0.12)', border: '1px solid #38bdf8', borderRadius: 20, padding: '5px 18px' }}>
          <span style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>🔒 Secure &nbsp;·&nbsp; Free to Apply &nbsp;·&nbsp; 24hr Response</span>
        </div>
      </div>

      {/* Card */}
      <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px 60px' }}>
        <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>

          {/* Step progress */}
          <div style={{ background: '#f8fafc', padding: '18px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 0 }}>
            {[1,2,3].map(n => (
              <div key={n} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 13,
                  background: step >= n ? '#6366f1' : '#e2e8f0',
                  color: step >= n ? '#fff' : '#94a3b8',
                  flexShrink: 0,
                }}>{n}</div>
                <div style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: step >= n ? '#4f46e5' : '#94a3b8' }}>
                  {n === 1 ? 'Personal Details' : n === 2 ? 'Services & Tier' : 'Confirm & Submit'}
                </div>
                {n < 3 && <div style={{ flex: 1, height: 2, background: step > n ? '#6366f1' : '#e2e8f0', margin: '0 12px' }} />}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding: '36px 40px' }}>

              {/* STEP 1 — Personal Details */}
              {step === 1 && (
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Your Details</h2>
                  <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14 }}>All fields marked * are required.</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle}>Full Name *</label>
                      <input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Thabo Nkosi" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email Address *</label>
                      <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone Number</label>
                      <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="e.g. 082 000 0000" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Location (City / Province) *</label>
                      <input required value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Johannesburg, GP" style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Availability</label>
                    <select value={form.availability} onChange={e => set('availability', e.target.value)} style={inputStyle}>
                      <option value="full-time">Full-Time (8+ hours/day)</option>
                      <option value="part-time">Part-Time (4 hours/day)</option>
                      <option value="flexible">Flexible (as work arrives)</option>
                      <option value="weekends">Weekends Only</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle}>Equipment Available</label>
                      <input value={form.equipment} onChange={e => set('equipment', e.target.value)} placeholder="e.g. Laptop, Desktop, Tablet" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Internet Speed / Type</label>
                      <input value={form.internet_speed} onChange={e => set('internet_speed', e.target.value)} placeholder="e.g. 50Mbps Fibre" style={inputStyle} />
                    </div>
                  </div>

                  <div style={{ marginBottom: 28 }}>
                    <label style={labelStyle}>Relevant Experience (optional)</label>
                    <textarea value={form.experience} onChange={e => set('experience', e.target.value)} rows={3}
                      placeholder="Briefly describe any relevant work experience, qualifications or skills..."
                      style={{ ...inputStyle, resize: 'vertical', height: 'auto', fontFamily: 'inherit' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => {
                      if (!form.name || !form.email || !form.location) { setError('Please fill in your full name, email address and location.'); return; }
                      setError(''); setStep(2);
                    }} style={btnPrimaryStyle}>
                      Next: Choose Services →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 — Services & Tier */}
              {step === 2 && (
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Services & Earning Tier</h2>
                  <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>Select the services you can perform, then choose your enrolment investment tier.</p>

                  {/* Services grid */}
                  <label style={{ ...labelStyle, marginBottom: 12, display: 'block' }}>Services I Can Perform *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 28 }}>
                    {SERVICES_LIST.map(s => {
                      const selected = form.services.includes(s.id);
                      return (
                        <div key={s.id} onClick={() => toggleService(s.id)} style={{
                          border: `2px solid ${selected ? '#6366f1' : '#e2e8f0'}`,
                          background: selected ? '#f0f0ff' : '#fafafa',
                          borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{
                            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${selected ? '#6366f1' : '#cbd5e1'}`,
                            background: selected ? '#6366f1' : '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {selected && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: selected ? '#4f46e5' : '#334155' }}>
                            {s.icon} {s.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Earning Tier */}
                  <label style={{ ...labelStyle, marginBottom: 12, display: 'block' }}>Choose Your Enrolment Investment *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {TIERS.map(t => {
                      const selected = form.desired_earnings === t.amount;
                      return (
                        <div key={t.amount} onClick={() => set('desired_earnings', t.amount)} style={{
                          border: `2px solid ${selected ? '#10b981' : '#e2e8f0'}`,
                          background: selected ? '#f0fdf4' : '#fafafa',
                          borderRadius: 10, padding: '14px 10px', cursor: 'pointer', textAlign: 'center',
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#065f46' : '#334155' }}>Pay</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: selected ? '#059669' : '#0f172a' }}>{ZAR(t.amount)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0' }}>→ Earn</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{ZAR(t.earn)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom amount */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
                    <label style={labelStyle}>Custom Amount (ZAR)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, color: '#64748b' }}>R</span>
                      <input type="number" min="100" step="50" value={form.desired_earnings}
                        onChange={e => set('desired_earnings', parseFloat(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 150, marginBottom: 0 }} />
                      <span style={{ fontSize: 14, color: '#64748b' }}>→ You earn</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{ZAR(earn)}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <button type="button" onClick={() => { setError(''); setStep(1); }} style={btnSecondaryStyle}>← Back</button>
                    <button type="button" onClick={() => {
                      if (form.services.length === 0) { setError('Please select at least one service.'); return; }
                      if (!form.desired_earnings || form.desired_earnings < 100) { setError('Please choose an enrolment investment of at least R100.'); return; }
                      setError(''); setStep(3);
                    }} style={btnPrimaryStyle}>
                      Next: Review & Confirm →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 — Confirm & Submit */}
              {step === 3 && (
                <div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Review & Submit</h2>
                  <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>Please review your application before submitting.</p>

                  {/* Summary */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Name</span><br /><span style={{ fontWeight: 700 }}>{form.name}</span></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Email</span><br /><span style={{ fontWeight: 700 }}>{form.email}</span></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Location</span><br /><span style={{ fontWeight: 700 }}>{form.location}</span></div>
                      <div><span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Availability</span><br /><span style={{ fontWeight: 700 }}>{form.availability}</span></div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Selected Services</span><br />
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {form.services.map(id => {
                          const s = SERVICES_LIST.find(x => x.id === id);
                          return <span key={id} style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 12, padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>{s?.icon} {s?.label}</span>;
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Earnings box */}
                  <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '2px solid #86efac', borderRadius: 12, padding: '20px 24px', marginBottom: 24, textAlign: 'center' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 1 }}>Your Earning Agreement</p>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>You Invest</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{ZAR(form.desired_earnings)}</div>
                      </div>
                      <div style={{ fontSize: 28, color: '#10b981', fontWeight: 900 }}>→</div>
                      <div>
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>You Earn Back</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>{ZAR(earn)}</div>
                      </div>
                    </div>
                    <p style={{ margin: '12px 0 0', fontSize: 12, color: '#166534' }}>Payment due after approval · Contracts allocated immediately upon confirmed payment</p>
                  </div>

                  {/* Agreement */}
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '18px 22px', marginBottom: 20 }}>
                    <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>Subcontractor Agreement Terms</p>
                    <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: '#78350f', lineHeight: 1.8 }}>
                      <li>I confirm that I am over 18 years of age and legally eligible to work as a subcontractor.</li>
                      <li>I understand that I must complete and submit assigned work by the stated deadline.</li>
                      <li>I accept that failure to deliver on time or to quality standard will result in financial penalties deducted from future earnings.</li>
                      <li>I understand that CTS BPO's client identities and contract values are confidential and may not be shared with any third party.</li>
                      <li>I confirm that the information provided in this application is true and accurate.</li>
                      <li>I agree that CTS BPO will allocate me contracts valued at twice my enrolment fee, payable to me upon verified completion and client payment.</li>
                    </ul>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.penalty_acknowledged}
                        onChange={e => set('penalty_acknowledged', e.target.checked)}
                        style={{ marginTop: 2, width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600, lineHeight: 1.6 }}>
                        I have read, understood and agree to all the terms and conditions of the CTS BPO Subcontractor Agreement stated above. *
                      </span>
                    </label>
                  </div>

                  {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#991b1b', fontWeight: 600, fontSize: 13 }}>{error}</div>}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <button type="button" onClick={() => { setError(''); setStep(2); }} style={btnSecondaryStyle}>← Back</button>
                    <button type="submit" disabled={sending} style={{
                      ...btnPrimaryStyle,
                      background: 'linear-gradient(135deg,#10b981,#059669)',
                      boxShadow: '0 4px 20px rgba(16,185,129,0.35)',
                      fontSize: 16, padding: '14px 36px',
                    }}>
                      {sending ? '⏳ Submitting...' : '✅ Submit Application'}
                    </button>
                  </div>
                </div>
              )}

              {error && step !== 3 && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', marginTop: 16, color: '#991b1b', fontWeight: 600, fontSize: 13 }}>{error}</div>
              )}
            </div>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 20 }}>
          Questions? Email <a href="mailto:cts.bposolutions@gmail.com" style={{ color: '#38bdf8' }}>cts.bposolutions@gmail.com</a> &nbsp;·&nbsp; © {new Date().getFullYear()} CTS BPO Solutions
        </p>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
};

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e2e8f0',
  borderRadius: 8, fontSize: 14, color: '#0f172a', background: '#fafafa',
  boxSizing: 'border-box', outline: 'none', marginBottom: 0,
  fontFamily: 'inherit',
};

const btnPrimaryStyle = {
  padding: '12px 28px', background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
  color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800,
  fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
};

const btnSecondaryStyle = {
  padding: '12px 20px', background: '#f1f5f9', color: '#475569',
  border: '1px solid #e2e8f0', borderRadius: 9, fontWeight: 700,
  fontSize: 14, cursor: 'pointer',
};
