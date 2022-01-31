import { useState, useEffect, useContext } from "react";
import TransactionForm from "../../components/forms/transactionForm/TransactionForm";
import {
  ConfirmTransaction,
  CustomNonce,
  ModalContainer,
  BroadcastTransaction,
} from "../../components/UI/modals";
import Hoc from "../../components/UI/Hoc";
import { useQuery, useMutation } from "@apollo/client";
import { useHistory } from "react-router-dom";
import {
  createAndSignLedgerTransaction,
  createLedgerPaymentInputFromPayload,
  isMinaAppOpen,
} from "../../tools/ledger";
import {
  toNanoMINA,
  createPaymentInputFromPayload,
  createSignatureInputFromSignature,
  signTransaction,
  MINIMUM_NONCE,
  readSession,
  deriveAccount,
  getPassphrase,
} from "../../tools";
import Spinner from "../../components/UI/Spinner";
import { BROADCAST_TRANSACTION, GET_FEE, GET_NONCE } from "../../graphql/query";
import { toast } from "react-toastify";
import {
  checkBalanceAfterTransaction,
  checkMemoLength,
  checkNonce,
  checkTransactionFields,
  initialTransactionData,
  INonceQueryResult,
  ModalStates,
  SendTXPageSteps,
} from "./SendTXHelper";
import {
  IFeeQuery,
  IWalletData,
  ITransactionData,
  IKeypair,
} from "../../types";
import { ILedgerContext } from "../../contexts/ledger/LedgerTypes";
import { LedgerContext } from "../../contexts/ledger/LedgerContext";
import { IBalanceContext } from "../../contexts/balance/BalanceTypes";
import { BalanceContext } from "../../contexts/balance/BalanceContext";
import Stepper from "../../components/UI/stepper/Stepper";
import TransactionAuthentication from "../../components/transactionAuthentication/TransactionAuthentication";

interface IProps {
  sessionData: IWalletData;
}

const SendTX = (props: IProps) => {
  const storedPassphrase = getPassphrase();
  const history = useHistory();
  const numberOfSteps = Object.values(SendTXPageSteps).filter(
    (val) => !isNaN(+val)
  ).length;
  const [privateKey, setPrivateKey] = useState<string>("");
  const [waitingNonce, setWaitingNonce] = useState<boolean>(false);
  const [sendTransactionFlag, setSendTransactionFlag] = useState<boolean>(
    false
  );
  const [step, setStep] = useState<number>(SendTXPageSteps.FORM);
  const [showModal, setShowModal] = useState<string>("");
  const [senderAddress, setSenderAddress] = useState<string>("");
  const [customNonce, setCustomNonce] = useState<number>(MINIMUM_NONCE);
  const [showLoader, setShowLoader] = useState<boolean>(true);
  const [ledgerError, setLedgerError] = useState(false);
  const [transactionData, setTransactionData] = useState<ITransactionData>(
    initialTransactionData
  );
  const [ledgerTransactionData, setLedgerTransactionData] = useState<string>(
    ""
  );
  const { isLedgerEnabled } = useContext<Partial<ILedgerContext>>(
    LedgerContext
  );
  const { balance, setShouldBalanceUpdate } = useContext<
    Partial<IBalanceContext>
  >(BalanceContext);
  const {
    data: nonceData,
    refetch: nonceRefetch,
    loading: nonceLoading,
    error: nonceError,
  } = useQuery<INonceQueryResult>(GET_NONCE, {
    variables: { publicKey: senderAddress },
    skip: !senderAddress,
    fetchPolicy: "network-only",
  });
  const feeQuery = useQuery<IFeeQuery>(GET_FEE, {
    onCompleted: (data) => {
      if (data?.estimatedFee?.txFees?.average) {
        setTransactionData({
          ...transactionData,
          fee: toNanoMINA(data.estimatedFee.txFees.average),
        });
      }
      setShowLoader(false);
    },
    onError: () => {
      setShowLoader(false);
    },
  });
  const [broadcastTransaction, broadcastResult] = useMutation(
    BROADCAST_TRANSACTION,
    {
      onError: (error) => {
        setTimeout(() => {
          toast.error(error.message);
          clearState();
        }, 1000);
      },
    }
  );

  /**
   * Listen for ledger action
   */
  useEffect(() => {
    if (isLedgerEnabled && !ledgerTransactionData) {
      if (step === SendTXPageSteps.PRIVATE_KEY) {
        const transactionListener = sendLedgerTransaction();
        // To be checked with ledger tests
        // @ts-ignore
        return transactionListener.unsubscribe;
      }
    }
    if (isLedgerEnabled && step === SendTXPageSteps.BROADCAST) {
      setTimeout(() => {
        broadcastLedgerTransaction();
      }, 2000);
    }
  }, [ledgerTransactionData, step]);

  /**
   * If there was a problem fetching the nonce, retry to fetch it
   */
  useEffect(() => {
    if (!nonceLoading && nonceError) {
      nonceRefetch();
    }
  }, [nonceLoading, nonceError]);

  useEffect(() => {
    if (waitingNonce && !nonceLoading) {
      openConfirmationModal();
      setWaitingNonce(false);
    }
  }, [waitingNonce, nonceLoading]);

  /**
   * If address is not stored inside component state, fetch it and save it.
   * If the transaction has been broadcasted successfully return to initial page state
   */
  useEffect(() => {
    getAndSetAddress();
    if (showModal && broadcastResult?.data && sendTransactionFlag) {
      clearState(false);
      setTimeout(() => {
        nonceRefetch({ publicKey: senderAddress });
        if (setShouldBalanceUpdate) {
          setShouldBalanceUpdate(true);
        }
        toast.success("Transaction successfully broadcasted");
        setStep(SendTXPageSteps.FORM);
        history.replace("/send-tx");
      }, 3000);
    }
  });

  /**
   * Clean component state on dismount
   */
  useEffect(() => {
    return () => {
      setPrivateKey("");
    };
  }, []);

  /**
   * Ledger data arrived, broadcast the transaction
   */
  const broadcastLedgerTransaction = () => {
    try {
      if (ledgerTransactionData) {
        const { amount, fee } = transactionData;
        const SendPaymentInput = createLedgerPaymentInputFromPayload({
          transactionData,
          fee,
          amount,
          senderAddress,
        });
        const SignatureInput = { rawSignature: ledgerTransactionData };
        broadcastTransaction({
          variables: { input: SendPaymentInput, signature: SignatureInput },
        });
        setSendTransactionFlag(true);
      }
    } catch (e) {
      toast.error("There was an error broadcasting delegation");
    }
  };

  /**
   * Check if nonce is available, if not ask the user for a custom nonce.
   * After the nonce is set, proceed with transaction data verification and Passphrase/Private key verification
   */
  const openConfirmationModal = () => {
    if (nonceLoading) {
      setWaitingNonce(true);
      return;
    }
    try {
      if (!nonceData && !customNonce) {
        return setShowModal(ModalStates.NONCE);
      }
      checkBalanceAfterTransaction({ balance, transactionData });
      checkTransactionFields(transactionData);
      if (isLedgerEnabled) {
        setStep(SendTXPageSteps.PRIVATE_KEY);
      } else {
        if (storedPassphrase) {
          setStep(SendTXPageSteps.CONFIRMATION);
        } else {
          setStep(SendTXPageSteps.PRIVATE_KEY);
        }
      }
      setShowModal("");
    } catch (e) {
      toast.error(e.message);
    }
  };

  /**
   *  Check if Passphrase/Private key is not empty
   */
  const confirmPrivateKey = async () => {
    try {
      if (!privateKey) {
        throw new Error();
      }
      setShowModal("");
      const derivedData = await deriveAccount(storedPassphrase || privateKey);
      setTransactionData({
        ...transactionData,
        senderAddress: derivedData.publicKey || "",
      });
      setStep(SendTXPageSteps.CONFIRMATION);
    } catch (e) {
      toast.error("Please check your Passphrase or Private key");
    }
  };

  /**
   * Get back to form
   */
  const stepBackwards = () => {
    setStep(step - 1);
    setPrivateKey("");
  };

  /**
   * If nonce is available from the back-end return it, otherwise return the custom nonce
   * @returns number Nonce
   */
  const getNonce = () => {
    return nonceData && checkNonce(nonceData)
      ? nonceData?.accountByKey.usableNonce
      : customNonce;
  };

  /**
   * Get sender public key from the session data and store it inside the component state
   */
  const getAndSetAddress = async () => {
    const wallet = await readSession();
    if (wallet) {
      setSenderAddress(wallet.address);
    }
  };

  /**
   * Clear component state
   */
  const clearState = (redirect = true) => {
    if (redirect) {
      setStep(SendTXPageSteps.FORM);
    }
    setShowModal("");
    setCustomNonce(MINIMUM_NONCE);
    setTransactionData(initialTransactionData);
    setLedgerTransactionData("");
    setSendTransactionFlag(false);
  };

  /**
   * Close nonce modal
   */
  const closeNonceModal = () => {
    setShowModal("");
    setCustomNonce(0);
  };

  /**
   * Sign transaction with Ledger
   */
  const sendLedgerTransaction = async () => {
    try {
      checkMemoLength(transactionData);
      await isMinaAppOpen();
      const senderAccount = props.sessionData?.ledgerAccount || 0;
      const actualNonce = getNonce();
      setTransactionData({ ...transactionData, nonce: actualNonce });
      const signature = await createAndSignLedgerTransaction({
        senderAccount,
        senderAddress,
        transactionData,
        nonce: actualNonce,
      });
      setLedgerTransactionData(signature.signature);
      setStep(SendTXPageSteps.CONFIRMATION);
    } catch (e) {
      toast.error(
        e.message || "An error occurred while loading hardware wallet"
      );
      setLedgerError(true);
    }
  };

  /**
   * Broadcast transaction without Ledger
   */
  const sendTransaction = async () => {
    setShowModal(ModalStates.BROADCASTING);
    setStep(SendTXPageSteps.BROADCAST);
    if (isLedgerEnabled) {
      return;
    }
    try {
      const actualNonce = getNonce();
      const derivedData = await deriveAccount(storedPassphrase || privateKey);
      setTransactionData({
        ...transactionData,
        senderAddress: derivedData.publicKey || "",
      });
      const keypair = {
        privateKey: derivedData?.privateKey,
        publicKey: derivedData?.publicKey,
      } as IKeypair;
      const signedPayment = signTransaction({
        transactionData,
        keypair,
        sender: derivedData?.publicKey || senderAddress,
        actualNonce,
      });
      if (signedPayment) {
        const signatureInput = createSignatureInputFromSignature(
          signedPayment.signature
        );
        const paymentInput = createPaymentInputFromPayload(
          signedPayment.payload
        );
        broadcastTransaction({
          variables: { input: paymentInput, signature: signatureInput },
        });
        setPrivateKey("");
        setSendTransactionFlag(true);
      }
    } catch (e) {
      setShowModal("");
      toast.error(
        "Check if the receiver address and/or the passphrase/private key are right"
      );
      stepBackwards();
      setPrivateKey("");
    }
  };

  const retryLedgerTransaction = () => {
    setLedgerError(false);
    sendLedgerTransaction();
  };

  return (
    <Hoc className="glass-card p-4 mt-2 mb-4">
      <Spinner
        show={showLoader || waitingNonce}
        className="spinner-container center full-width"
      >
        <div>
          <div className="w-100">
            <div className="flex flex-col flex-vertical-center">
              <h1>New Transaction</h1>
              <Stepper max={numberOfSteps} step={step + 1} />
            </div>
          </div>

          <div className="animate__animated animate__fadeIn">
            {step === SendTXPageSteps.FORM ? (
              <TransactionForm
                averageFee={feeQuery?.data?.estimatedFee?.txFees?.average || 0}
                fastFee={feeQuery?.data?.estimatedFee?.txFees?.fast || 0}
                nextStep={openConfirmationModal}
                transactionData={transactionData}
                setData={setTransactionData}
                balance={balance}
              />
            ) : step === SendTXPageSteps.PRIVATE_KEY ? (
              <TransactionAuthentication
                isLedgerEnabled={isLedgerEnabled}
                setPrivateKey={setPrivateKey}
                stepBackwards={stepBackwards}
                confirmPrivateKey={confirmPrivateKey}
                ledgerError={ledgerError}
                stepBackward={stepBackwards}
                retryLedgerTransaction={retryLedgerTransaction}
              />
            ) : step === SendTXPageSteps.CONFIRMATION ? (
              <ConfirmTransaction
                walletAddress={senderAddress}
                transactionData={transactionData}
                ledgerTransactionData={ledgerTransactionData}
                isLedgerEnabled={isLedgerEnabled}
                stepBackward={stepBackwards}
                sendTransaction={sendTransaction}
              />
            ) : (
              <BroadcastTransaction />
            )}
          </div>
          <ModalContainer
            show={showModal === ModalStates.NONCE}
            close={closeNonceModal}
          >
            <CustomNonce
              proceedHandler={openConfirmationModal}
              setCustomNonce={setCustomNonce}
              nonce={customNonce}
            />
          </ModalContainer>
        </div>
      </Spinner>
    </Hoc>
  );
};

export default SendTX;
