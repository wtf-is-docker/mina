import { ISignature } from './../models/signature';
import { signPayment } from "@o1labs/client-sdk";
import { IKeypair } from "../models/keypair";
import { ITransactionPayload } from '../models/transaction-payload';

// TODO : Fix props
export const signTransaction = (transactionData:any, keypair:IKeypair, sender:string, actualNonce:number) => {
  const { fee, amount, receiverAddress, memo } = transactionData;
  const signedPayment = signPayment(
    {
      from: sender,
      to: receiverAddress,
      amount,
      fee,
      nonce: actualNonce,
      memo,
    },
    keypair
  );
  return signedPayment;
}

export const createSignatureInputFromSignature = (signature:ISignature) => {
  return {
    scalar: signature.scalar,
    field: signature.field,
  };
}

export const createPaymentInputFromPayload = (payload:ITransactionPayload) => {
  return {
    nonce: payload.nonce,
    memo: payload.memo,
    fee: payload.fee,
    amount: payload.amount,
    to: payload.to,
    from: payload.from,
  };
}

export const createDelegationPaymentInputFromPayload = (payload:ITransactionPayload) => {
  return {
    nonce: payload.nonce,
    fee: payload.fee,
    validUntil: payload.validUntil,
    to: payload.to,
    from: payload.from,
  };
}