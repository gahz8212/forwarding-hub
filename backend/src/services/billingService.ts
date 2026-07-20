import Big from 'big.js';

export interface CarItem {
  vin: string;
  model_name: string;
  cargo_type: 'SEDAN' | 'SUV' | 'TRUCK' | 'BUS';
  inland_cost_krw?: number;
  surcharge_cost_krw?: number;
}

export interface ClientMargin {
  client_id: string;
  client_name: string;
  margin_type: 'PERCENTAGE' | 'FIXED';
  ocean_margin_rate: string | number;
  local_margin_rate: string | number;
  fixed_margin_per_unit: string | number;
}

export interface CostRate {
  cargo_type: 'SEDAN' | 'SUV' | 'TRUCK' | 'BUS';
  ocean_cost_usd: string | number;
  lashing_cost_krw: string | number;
  thc_cost_krw: string | number;
  wharfage_cost_krw: string | number;
  bl_fee_krw: string | number;
  customs_cost_krw: string | number;
}

export interface CalculationResult {
  master: {
    total_ocean_usd: string;
    total_ocean_krw: string;
    total_local_krw: string;
    final_amount_krw: string;
    exchange_rate: string;
    bl_fee_krw: string;
    customs_fee_krw: string;
  };
  items: Array<{
    vin: string;
    model_name: string;
    cargo_type: string;
    applied_ocean_usd: string;
    applied_lashing_krw: string;
    applied_thc_krw: string;
    applied_wharfage_krw: string;
    applied_inland_krw: string;
  }>;
}

/**
 * Normalizes user-input vehicle type or model name to standard cargo_type
 */
export function mapVehicleTypeToCargoType(vehicleType: string, modelName: string): 'SEDAN' | 'SUV' | 'TRUCK' | 'BUS' {
  const combined = `${vehicleType || ''} ${modelName || ''}`.toUpperCase();
  
  if (combined.includes('SEDAN') || combined.includes('승용') || combined.includes('아반떼') || combined.includes('쏘나타') || combined.includes('그랜저') || combined.includes('AVANTE') || combined.includes('SONATA') || combined.includes('GRANDEUR')) {
    return 'SEDAN';
  }
  if (combined.includes('SUV') || combined.includes('승합') || combined.includes('스포티지') || combined.includes('투싼') || combined.includes('싼타페') || combined.includes('팰리세이드') || combined.includes('카니발') || combined.includes('SPORTAGE') || combined.includes('TUCSON') || combined.includes('SANTA') || combined.includes('CARNIVAL')) {
    return 'SUV';
  }
  if (combined.includes('TRUCK') || combined.includes('화물') || combined.includes('포터') || combined.includes('봉고') || combined.includes('PORTER') || combined.includes('BONGO')) {
    return 'TRUCK';
  }
  if (combined.includes('BUS') || combined.includes('버스') || combined.includes('스타리아') || combined.includes('스타렉스') || combined.includes('STARIA') || combined.includes('STAREX')) {
    return 'BUS';
  }
  
  return 'SEDAN'; // default fallback
}

/**
 * Calculates invoice totals and breakdown safely using big.js to prevent float errors
 */
export function calculateSafeInvoice(
  carList: CarItem[],
  clientMargin: ClientMargin,
  costRates: CostRate[],
  exchangeRateStr: string
): CalculationResult {
  const isPercentage = clientMargin.margin_type === 'PERCENTAGE';
  const oceanMarginMultiplier = isPercentage 
    ? new Big(clientMargin.ocean_margin_rate).div(100).plus(1)
    : new Big(1);
  const localMarginMultiplier = isPercentage
    ? new Big(clientMargin.local_margin_rate).div(100).plus(1)
    : new Big(1);
  
  const fixedMarginPerUnit = !isPercentage
    ? new Big(clientMargin.fixed_margin_per_unit)
    : new Big(0);

  const exchangeRate = new Big(exchangeRateStr);

  let totalOceanUSD = new Big(0);
  let totalLocalKRW = new Big(0);
  
  const calculatedItems: CalculationResult['items'] = [];

  for (const car of carList) {
    const cost = costRates.find(r => r.cargo_type === car.cargo_type);
    if (!cost) {
      throw new Error(`Cost rate not found for cargo type: ${car.cargo_type}`);
    }
    
    // Ocean freight (USD)
    let sellOceanUSD = new Big(cost.ocean_cost_usd);
    if (isPercentage) {
      sellOceanUSD = sellOceanUSD.times(oceanMarginMultiplier).round(2, 1); // 1 = round half up
    } else {
      sellOceanUSD = sellOceanUSD.plus(fixedMarginPerUnit).round(2, 1);
    }
    
    // Local charge (KRW) - lashing, THC and wharfage (all per-unit costs, local margin applies if PERCENTAGE)
    let sellLashingKRW = new Big(cost.lashing_cost_krw);
    if (isPercentage) {
      sellLashingKRW = sellLashingKRW.times(localMarginMultiplier).round(0, 1);
    } else {
      sellLashingKRW = sellLashingKRW.round(0, 1);
    }

    let sellThcKRW = new Big(cost.thc_cost_krw);
    if (isPercentage) {
      sellThcKRW = sellThcKRW.times(localMarginMultiplier).round(0, 1);
    } else {
      sellThcKRW = sellThcKRW.round(0, 1);
    }

    let sellWharfageKRW = new Big(cost.wharfage_cost_krw);
    if (isPercentage) {
      sellWharfageKRW = sellWharfageKRW.times(localMarginMultiplier).round(0, 1);
    } else {
      sellWharfageKRW = sellWharfageKRW.round(0, 1);
    }

    let sellInlandKRW = new Big(car.inland_cost_krw || 0).plus(car.surcharge_cost_krw || 0);
    if (isPercentage) {
      sellInlandKRW = sellInlandKRW.times(localMarginMultiplier).round(0, 1);
    } else {
      sellInlandKRW = sellInlandKRW.round(0, 1);
    }

    totalOceanUSD = totalOceanUSD.plus(sellOceanUSD);
    totalLocalKRW = totalLocalKRW.plus(sellLashingKRW).plus(sellThcKRW).plus(sellWharfageKRW).plus(sellInlandKRW);

    calculatedItems.push({
      vin: car.vin,
      model_name: car.model_name,
      cargo_type: car.cargo_type,
      applied_ocean_usd: sellOceanUSD.toFixed(2),
      applied_lashing_krw: sellLashingKRW.toFixed(0),
      applied_thc_krw: sellThcKRW.toFixed(0),
      applied_wharfage_krw: sellWharfageKRW.toFixed(0),
      applied_inland_krw: sellInlandKRW.toFixed(0)
    });
  }

  // B/L Fee - pass through (no margin)
  const blFeeKRW = costRates.length > 0 ? new Big(costRates[0].bl_fee_krw) : new Big(0);
  // Customs clearance fee - pass through (no margin)
  const customsFeeKRW = costRates.length > 0 ? new Big(costRates[0].customs_cost_krw) : new Big(0);
  
  totalLocalKRW = totalLocalKRW.plus(blFeeKRW).plus(customsFeeKRW);

  // Convert USD to KRW and round down (절사)
  const convertedOceanKRW = totalOceanUSD.times(exchangeRate).round(0, 0); // 0 = round down
  
  const finalAmountKRW = convertedOceanKRW.plus(totalLocalKRW);

  return {
    master: {
      total_ocean_usd: totalOceanUSD.toFixed(2),
      total_ocean_krw: convertedOceanKRW.toFixed(0),
      total_local_krw: totalLocalKRW.toFixed(0),
      final_amount_krw: finalAmountKRW.toFixed(0),
      exchange_rate: exchangeRate.toFixed(2),
      bl_fee_krw: blFeeKRW.toFixed(0),
      customs_fee_krw: customsFeeKRW.toFixed(0)
    },
    items: calculatedItems
  };
}
