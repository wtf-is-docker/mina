import {
  Check,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  AlertTriangle,
} from "react-feather";

const TransactionIcon = (
  txType: string,
  sender: string,
  receiver: string,
  userAddress: string,
  isScam: boolean
) => {
  if (isScam) {
    return <AlertTriangle data-tip="Scam transaction!" />;
  }
  if (txType === "delegation") {
    return <Check data-tip="Delegation TX" />;
  } else {
    if (receiver === sender) {
      return <ChevronRight data-tip="Self transaction" />;
    } else if (userAddress === sender) {
      return <ChevronsUp data-tip="Outgoing TX" color="red" />;
    } else if (userAddress === receiver) {
      return <ChevronsDown data-tip="Incoming TX" color="green" />;
    } else {
      return <ChevronRight />;
    }
  }
};

export default TransactionIcon;
