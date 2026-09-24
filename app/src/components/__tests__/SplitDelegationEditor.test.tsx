/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SplitDelegationEditor } from "../SplitDelegationEditor";

const SELF_ADDRESS = "GD6HLZWRE5FHK3SDLZB3FH56R3H3ECAAYCPWWU7O7EK4FCNT2Z7S6D5I";
const ADDR_A = "GDOOXICJPSOZDQRCEHZPR6MAX5PUZXVWGJ3QPVEU4DADIZQ4YBQOJNIB";
const ADDR_B = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const ADDR_C = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ";

const delegateSplit = jest.fn().mockResolvedValue("txhash123");

jest.mock("../lib/wallet-context", () => ({
  useWallet: () => ({
    isConnected: true,
    publicKey: SELF_ADDRESS,
    connect: jest.fn(),
    signTransaction: jest.fn(),
  }),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../hooks/useSplitDelegation", () => ({
  useSplitDelegation: () => ({
    splits: [],
    loading: false,
    error: null,
    submitting: false,
    refetch: jest.fn(),
    delegateSplit,
    undelegateSplit: jest.fn(),
  }),
}));

const toast = jest.requireMock("react-hot-toast").default as {
  success: jest.Mock;
  error: jest.Mock;
};

const defaultProps = {
  open: true,
  onClose: jest.fn(),
  onDelegated: jest.fn(),
};

function addressInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText("Stellar address (G...)") as HTMLInputElement[];
}

function percentInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText("0") as HTMLInputElement[];
}

function submitButton() {
  return screen.getByRole("button", { name: /split delegate/i });
}

async function fillRow(index: number, address: string, percent: string) {
  await userEvent.type(addressInputs()[index], address);
  await userEvent.clear(percentInputs()[index]);
  await userEvent.type(percentInputs()[index], percent);
}

describe("SplitDelegationEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delegateSplit.mockResolvedValue("txhash123");
  });

  describe("sum-to-100% invariant", () => {
    it("disables submit while the total is under 100%", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "60");
      expect(submitButton()).toBeDisabled();
      expect(screen.getByText(/40\.00% remaining/)).toBeInTheDocument();
    });

    it("disables submit when the total is over 100%", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "70");
      await fillRow(1, ADDR_B, "40");
      expect(submitButton()).toBeDisabled();
      expect(screen.getByText(/10\.00% over/)).toBeInTheDocument();
    });

    it("enables submit once rows sum to exactly 100%", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "60");
      await fillRow(1, ADDR_B, "40");
      await waitFor(() => expect(submitButton()).not.toBeDisabled());
    });

    it("submits weights in basis points summing to exactly 10000", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "60");
      await fillRow(1, ADDR_B, "40");
      await waitFor(() => expect(submitButton()).not.toBeDisabled());
      await userEvent.click(submitButton());

      await waitFor(() => expect(delegateSplit).toHaveBeenCalledTimes(1));
      const splits = delegateSplit.mock.calls[0][0];
      expect(splits).toEqual([
        { delegatee: ADDR_A, weightBps: 6000 },
        { delegatee: ADDR_B, weightBps: 4000 },
      ]);
      expect(splits.reduce((s: number, x: { weightBps: number }) => s + x.weightBps, 0)).toBe(10000);
    });
  });

  describe("rounding across uneven splits", () => {
    it("credits the rounding remainder to the last row for a 3-way even split", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await userEvent.click(screen.getByRole("button", { name: /add delegatee/i }));
      await fillRow(0, ADDR_A, "33.33");
      await fillRow(1, ADDR_B, "33.33");
      await fillRow(2, ADDR_C, "33.34");
      await waitFor(() => expect(submitButton()).not.toBeDisabled());
      await userEvent.click(submitButton());

      await waitFor(() => expect(delegateSplit).toHaveBeenCalledTimes(1));
      const splits: Array<{ delegatee: string; weightBps: number }> = delegateSplit.mock.calls[0][0];
      const total = splits.reduce((s, x) => s + x.weightBps, 0);
      expect(total).toBe(10000);
      // Each row is close to a third; only the last row absorbs the remainder.
      expect(splits[0].weightBps).toBe(3333);
      expect(splits[1].weightBps).toBe(3333);
      expect(splits[2].weightBps).toBe(3334);
    });

    it("'Split evenly' distributes a 3-way split so it sums to exactly 100%", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await userEvent.type(addressInputs()[0], ADDR_A);
      await userEvent.type(addressInputs()[1], ADDR_B);
      await userEvent.click(screen.getByRole("button", { name: /add delegatee/i }));
      await userEvent.type(addressInputs()[2], ADDR_C);

      await userEvent.click(screen.getByRole("button", { name: /split evenly/i }));

      await waitFor(() => {
        const total = percentInputs().reduce((s, i) => s + Number(i.value || 0), 0);
        expect(total).toBeCloseTo(100, 2);
      });
      await waitFor(() => expect(submitButton()).not.toBeDisabled());
    });
  });

  describe("duplicate and invalid addresses", () => {
    it("shows an error and blocks submit for an invalid address", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, "not-a-valid-address", "100");
      expect(await screen.findByText("Invalid Stellar address.")).toBeInTheDocument();
      expect(submitButton()).toBeDisabled();
    });

    it("shows a duplicate-address error and blocks submit", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "50");
      await fillRow(1, ADDR_A, "50");
      expect(
        await screen.findByText("Duplicate delegatee addresses aren't allowed."),
      ).toBeInTheDocument();
      expect(submitButton()).toBeDisabled();
    });

    it("never calls delegateSplit when validation fails", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "50");
      await fillRow(1, ADDR_A, "50");
      fireEvent.submit(submitButton().closest("form")!);
      await new Promise((r) => setTimeout(r, 0));
      expect(delegateSplit).not.toHaveBeenCalled();
    });
  });

  describe("exceeding max_split_targets", () => {
    it("surfaces the contract's rejection as an error toast without closing the dialog", async () => {
      delegateSplit.mockRejectedValueOnce(new Error("Error(Contract, #12)"));
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "60");
      await fillRow(1, ADDR_B, "40");
      await waitFor(() => expect(submitButton()).not.toBeDisabled());
      await userEvent.click(submitButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(toast.error.mock.calls[0][0]).toContain("Error(Contract, #12)");
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe("removing a target", () => {
    it("removes a row and updates the total", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      await fillRow(0, ADDR_A, "50");
      await fillRow(1, ADDR_B, "50");

      const removeButtons = screen.getAllByRole("button", { name: /remove row/i });
      await userEvent.click(removeButtons[1]);

      expect(addressInputs()).toHaveLength(1);
      expect(screen.getByText(/50\.00% remaining/)).toBeInTheDocument();
    });

    it("does not allow removing the last remaining row", async () => {
      render(<SplitDelegationEditor {...defaultProps} />);
      const removeButtons = screen.getAllByRole("button", { name: /remove row/i });
      // Remove down to one row.
      await userEvent.click(removeButtons[1]);
      const lastRemove = screen.getAllByRole("button", { name: /remove row/i })[0];
      expect(lastRemove).toBeDisabled();
    });
  });
});
