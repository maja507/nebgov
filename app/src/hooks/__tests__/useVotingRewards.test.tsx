/**
 * @jest-environment jsdom
 */

import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useEpochLeaderboard } from "../useVotingRewards";

const backendFetchMock = jest.fn();

jest.mock("../../lib/backend", () => ({
  backendFetch: (...args: any[]) => backendFetchMock(...args),
}));

describe("useEpochLeaderboard", () => {
  it("returns a refetch function and re-queries after refetch", async () => {
    backendFetchMock.mockResolvedValue({
      data: [{ claimant_address: "GAAA", amount: "10", claimed: false }],
    });

    let snapshot: any = null;

    function Probe() {
      const state = useEpochLeaderboard(1n, 10);
      useEffect(() => {
        snapshot = state;
      }, [state]);
      return null;
    }

    render(<Probe />);

    await waitFor(() => {
      expect(snapshot).toBeTruthy();
      expect(Array.isArray(snapshot.rows)).toBe(true);
    });

    expect(typeof snapshot.refetch).toBe("function");
    expect(backendFetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      snapshot.refetch();
    });

    await waitFor(() => expect(backendFetchMock).toHaveBeenCalledTimes(2));
  });
});
