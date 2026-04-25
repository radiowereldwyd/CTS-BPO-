/**
 * AI Negotiation Engine
 * Handles dynamic pricing negotiation with margin protection.
 * Target win rate: ±90%
 */

const MARGIN_FLOOR_PERCENT = 0.15; // Minimum 15% margin

/**
 * Evaluate a negotiation offer and decide to accept, counter, or reject.
 * @param {object} params
 * @param {number} params.clientOffer - The client's proposed price
 * @param {number} params.baseCost - Our internal cost to deliver
 * @param {number} params.targetPrice - Our ideal price
 * @returns {object} negotiation decision
 */
function negotiate({ clientOffer, baseCost, targetPrice }) {
  if (!clientOffer || !baseCost || !targetPrice) {
    throw new Error('clientOffer, baseCost, and targetPrice are required');
  }

  const minAcceptable = baseCost * (1 + MARGIN_FLOOR_PERCENT);
  const margin = (clientOffer - baseCost) / clientOffer;

  if (clientOffer >= targetPrice) {
    return {
      decision: 'accept',
      agreedPrice: clientOffer,
      margin: margin,
      message: 'Offer meets or exceeds target price. Accepted.',
    };
  }

  if (clientOffer >= minAcceptable) {
    const counterOffer = (clientOffer + targetPrice) / 2;
    return {
      decision: 'counter',
      counterOffer: Math.round(counterOffer * 100) / 100,
      margin: margin,
      message: 'Offer is above floor but below target. Counter-offer made.',
    };
  }

  return {
    decision: 'reject',
    minAcceptable: Math.round(minAcceptable * 100) / 100,
    margin: margin,
    message: 'Offer is below margin floor. Rejected.',
  };
}

/**
 * Calculate the optimal price for a contract based on complexity and market data.
 * @param {object} params
 * @param {string} params.contractType - Type of contract
 * @param {number} params.complexity - Complexity score 1-10
 * @param {number} params.baseCost - Internal cost estimate
 * @returns {object} pricing recommendation
 */
function calculateOptimalPrice({ contractType, complexity, baseCost }) {
  const complexityMultiplier = 1 + (complexity / 10) * 0.5;
  const targetPrice = baseCost * complexityMultiplier * (1 + MARGIN_FLOOR_PERCENT + 0.15);

  return {
    contractType,
    complexity,
    baseCost,
    recommendedPrice: Math.round(targetPrice * 100) / 100,
    marginTarget: '30%',
  };
}

module.exports = { negotiate, calculateOptimalPrice };
