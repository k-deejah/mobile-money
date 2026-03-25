import * as StellarSdk from "stellar-sdk";

export const getStellarServer = () => {
  const horizonUrl =
    process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
  return new StellarSdk.Horizon.Server(horizonUrl);
};

export const getNetworkPassphrase = () => {
  return process.env.STELLAR_NETWORK === "mainnet"
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;
};
