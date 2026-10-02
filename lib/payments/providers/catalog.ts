export type PaymentProviderCapability=
  |'HOSTED_PAYMENT_LINK'
  |'VERIFIED_WEBHOOK'
  |'SERVER_READBACK'
  |'REFUND'
  |'PARTIAL_REFUND';

export type PaymentProviderConfigurationKind='OMAN_API_KEYS';

export type PaymentProviderDefinition={
  code:string;
  label:string;
  countries:readonly string[];
  currencies:readonly string[];
  capabilities:readonly PaymentProviderCapability[];
  configuration:{
    kind:PaymentProviderConfigurationKind;
    requiresMerchantId:boolean;
    requiresPublishableKey:boolean;
  };
  settlementAuthority:'PAYMENT_CORE';
};

export const PAYMENT_PROVIDER_CATALOG=[
  {
    code:'TAP',
    label:'Tap Payments',
    countries:['OM'],
    currencies:['OMR'],
    capabilities:['HOSTED_PAYMENT_LINK','VERIFIED_WEBHOOK','SERVER_READBACK','REFUND','PARTIAL_REFUND'],
    configuration:{kind:'OMAN_API_KEYS',requiresMerchantId:true,requiresPublishableKey:false},
    settlementAuthority:'PAYMENT_CORE',
  },
  {
    code:'THAWANI',
    label:'Thawani Pay',
    countries:['OM'],
    currencies:['OMR'],
    capabilities:['HOSTED_PAYMENT_LINK','SERVER_READBACK','REFUND'],
    configuration:{kind:'OMAN_API_KEYS',requiresMerchantId:false,requiresPublishableKey:true},
    settlementAuthority:'PAYMENT_CORE',
  },
] as const satisfies readonly PaymentProviderDefinition[];

export type RegisteredPaymentProviderCode=(typeof PAYMENT_PROVIDER_CATALOG)[number]['code'];

export function listPaymentProviders():readonly PaymentProviderDefinition[]{
  return PAYMENT_PROVIDER_CATALOG;
}

export function getPaymentProviderDefinition(providerInput:string):PaymentProviderDefinition{
  const code=providerInput.trim().toUpperCase();
  const definition=PAYMENT_PROVIDER_CATALOG.find(item=>item.code===code);
  if(!definition)throw new Error('Unsupported payment provider');
  return definition;
}

export function normalizeRegisteredPaymentProvider(providerInput:string):RegisteredPaymentProviderCode{
  return getPaymentProviderDefinition(providerInput).code as RegisteredPaymentProviderCode;
}

export function paymentProviderSupports(
  providerInput:string,
  capability:PaymentProviderCapability
){
  return getPaymentProviderDefinition(providerInput).capabilities.includes(capability as never);
}

export function paymentProviderSupportsCurrency(providerInput:string,currencyInput:string){
  const currency=currencyInput.trim().toUpperCase();
  return getPaymentProviderDefinition(providerInput).currencies.includes(currency as never);
}
