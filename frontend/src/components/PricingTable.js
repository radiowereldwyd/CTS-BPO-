import React from 'react';

const TIERS = [
  {
    name: 'Starter',
    price: 'R5,000',
    perMonth: true,
    color: '#3b82f6',
    features: [
      'Up to 10 contracts/month',
      'AI sourcing & outreach',
      'Basic dashboard',
      'Email support',
      'Ozow payment integration',
      'Audit trail logging',
    ],
  },
  {
    name: 'Growth',
    price: 'R15,000',
    perMonth: true,
    color: '#22c55e',
    highlighted: true,
    features: [
      'Up to 50 contracts/month',
      'AI sourcing, negotiation & assignment',
      'Advanced dashboard & analytics',
      'Priority support',
      'Ozow payment integration',
      'Full audit trail & compliance',
      'Subcontractor management',
      'Failed contract recovery',
    ],
  },
  {
    name: 'Enterprise',
    price: 'R50,000',
    perMonth: true,
    color: '#a855f7',
    features: [
      'Unlimited contracts',
      'Full AI team (all modules)',
      'Custom dashboard & reporting',
      'Dedicated account manager',
      'Multi-currency support',
      'POPIA/GDPR/CCPA compliance',
      'API access & integrations',
      'SLA guarantee',
      'Global market expansion',
    ],
  },
];

function PricingTable() {
  return (
    <div className="pricing-table">
      <h2>Pricing</h2>
      <p className="pricing-subtitle">Choose the plan that fits your BPO needs. All plans include AI-driven automation.</p>
      <div className="pricing-cards">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={`pricing-card ${tier.highlighted ? 'pricing-card--highlighted' : ''}`}
            style={{ borderTop: `4px solid ${tier.color}` }}
          >
            <h3 style={{ color: tier.color }}>{tier.name}</h3>
            <div className="pricing-price">
              <span className="pricing-amount">{tier.price}</span>
              {tier.perMonth && <span className="pricing-period">/month</span>}
            </div>
            <ul className="pricing-features">
              {tier.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <button className="btn-pricing" style={{ background: tier.color }}>
              Get Started
            </button>
          </div>
        ))}
      </div>

      {/* Annual Projection Summary */}
      <div className="pricing-projection">
        <h3>12-Month Revenue Projection</h3>
        <table className="projection-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th>Target Clients</th>
              <th>Monthly Income</th>
              <th>Annual Income</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Starter</td>
              <td>10</td>
              <td>R50,000</td>
              <td>R600,000</td>
            </tr>
            <tr>
              <td>Growth</td>
              <td>5</td>
              <td>R75,000</td>
              <td>R900,000</td>
            </tr>
            <tr>
              <td>Enterprise</td>
              <td>2</td>
              <td>R100,000</td>
              <td>R1,200,000</td>
            </tr>
            <tr className="projection-total">
              <td><strong>Total</strong></td>
              <td><strong>17</strong></td>
              <td><strong>R225,000</strong></td>
              <td><strong>R2,700,000</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PricingTable;
