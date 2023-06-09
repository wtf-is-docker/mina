import { useQuery } from "@apollo/client";
import { GET_NETWORK } from "../../graphql/query";
import { storeNetworkData } from "../../tools";
import { INetworkData } from "../../types/NetworkData";

const Footer = () => {
  const { data: network } = useQuery<INetworkData>(GET_NETWORK, {
    onCompleted: async (data) => {
      if (data?.nodeInfo) {
        await storeNetworkData(data?.nodeInfo);
      }
    },
  });
  const renderNetwork = network?.nodeInfo
    ? `${network.nodeInfo.name} | ${network.nodeInfo.network}`
    : "Network unavailable";

  return (
    <div className="full-width-align-center footer-text">
      ~Clorio is a wallet offered by Carbonara from WeStake.Club and is not
      developed by O(1)Labs.
      <br />
      <div>{renderNetwork}</div>
    </div>
  );
};

export default Footer;
