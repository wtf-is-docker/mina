import { useState } from "react";
import Hoc from "../../components/general/Hoc";
import SignMessageForm from "../../components/forms/sign-message/SignMessageForm";
import { derivePublicKey, signMessage } from "@o1labs/client-sdk";
import { toast } from "react-toastify";
import { LedgerContext } from "../../context/LedgerContext";
import { useContext } from "react";
import { IMessageToSign } from "../../models/message-to-sign";
import SignatureMessageResult from "./SignatureMessageResult";
import SignMessageLedgerScreen from "./SignMessageLedgerScreen";

export default function SignMessage() {
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState({
    payload: "",
    signature: {
      scalar: "",
      field: "",
    },
    publicKey: "",
  });
  const { isLedgerEnabled }:any = useContext(LedgerContext);

  /**
   * If fields are not empty, sign message and set result to component state
   */
  const submitHandler = (messageToSign:IMessageToSign) => {
    try {
      const publicKey = derivePublicKey(messageToSign.privateKey)
      const keypair = {
        publicKey,
        privateKey: messageToSign.privateKey,
      };
      setResult(signMessage(messageToSign.message, keypair));
      setShowResult(true);
    } catch (e) {
      toast.error("Please check private key");
    }
  }

  /**
   * Clear form data from state
   */
  const resetForm = () => {
    setResult({
      payload: "",
      signature: {
        scalar: "",
        field: "",
      },
      publicKey: "",
    });
    setShowResult(false);
  }

  if (isLedgerEnabled) {
    return <SignMessageLedgerScreen />;
  }

  if (showResult) {
    return <SignatureMessageResult 
      result={result} 
      resetForm={resetForm} />
  }

  return (
    <Hoc>
      <div className="animate__animated animate__fadeIn">
        <SignMessageForm
          submitHandler={submitHandler}
        />
      </div>
    </Hoc>
  );
}