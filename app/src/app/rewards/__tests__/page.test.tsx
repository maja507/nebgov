/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RewardsPage from "../page";

const refetchEpochsMock = jest.fn();
const refetchRewardsMock = jest.fn();
const refetchLeaderboardMock = jest.fn();
const claimWithSignMock = jest.fn().mockResolvedValue(undefined);

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../../lib/wallet-context", () => ({
  useWallet: () => ({
    isConnected: true,
    publicKey: "GCLAIMER",
    signTransaction: jest.fn(),
    connect: jest.fn(),
  }),
}));

jest.mock("../../../lib/hooks/useLedgerClock", () => ({
  useLedgerClock: () => ({ currentLedger: 150 }),
}));

jest.mock("../../../hooks/useVotingRewards", () => ({
  buildVotingRewardsClient: () => ({
    claimWithSign: claimWithSignMock,
  }),
  useCurrentRewardEpoch: () => ({
    epoch: { id: 2n, startLedger: 100, endLedger: 200 },
    loading: false,
    error: null,
  }),
  useRewardEpochs: () => ({
    epochs: [
      {
        epochId: 1n,
        startLedger: 10,
        endLedger: 20,
        merkleRoot: "0xabc",
        totalRewardAmount: 123n,
        publishedAt: "2026-09-24T00:00:00.000Z",
      },
    ],
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: jest.fn(),
    refetch: refetchEpochsMock,
  }),
  useClaimableRewards: () => ({
    rewards: [
      { epochId: 1n, amount: 25n, merkleProof: ["0xproof"], claimed: false },
    ],
    unclaimed: [
      { epochId: 1n, amount: 25n, merkleProof: ["0xproof"], claimed: false },
    ],
    totalUnclaimed: 25n,
    totalEarned: 25n,
    loading: false,
    error: null,
    refetch: refetchRewardsMock,
  }),
}));

jest.mock("../../../components/EpochRewardCard", () => ({
  EpochRewardCard: ({ onClaim }: { onClaim?: () => void }) => (
    <button onClick={onClaim} type="button">
      Claim Epoch
    </button>
  ),
}));

jest.mock("../../../components/RewardsLeaderboard", () => ({
  RewardsLeaderboard: ({ onRefetchReady }: { onRefetchReady?: (refetch: () => void) => void }) => {
    useEffect(() => {
      onRefetchReady?.(refetchLeaderboardMock);
    }, [onRefetchReady]);
    return <div>Leaderboard</div>;
  },
}));

jest.mock("../../../components/ui/Skeleton", () => ({
  Skeleton: () => <div />,
}));

describe("RewardsPage claim flow", () => {
  beforeEach(() => {
    refetchEpochsMock.mockClear();
    refetchRewardsMock.mockClear();
    refetchLeaderboardMock.mockClear();
    claimWithSignMock.mockClear();
  });

  it("refetches leaderboard after successful claim", async () => {
    render(<RewardsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Claim Epoch" }));

    await waitFor(() => expect(claimWithSignMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refetchRewardsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refetchEpochsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refetchLeaderboardMock).toHaveBeenCalledTimes(1));
  });
});
