/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WithdrawalRequestModal } from "../WithdrawalRequestModal";
import type { TreasuryStrategiesClient, IndexedStrategy } from "@nebgov/sdk";
import type { StrategyRow } from "../../hooks/useTreasuryStrategies";

const TREASURY_ADDRESS = "GDOOXICJPSOZDQRCEHZPR6MAX5PUZXVWGJ3QPVEU4DADIZQ4YBQOJNIB";
const OTHER_WALLET = "GD6HLZWRE5FHK3SDLZB3FH56R3H3ECAAYCPWWU7O7EK4FCNT2Z7S6D5I";

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../lib/hooks/useLedgerClock", () => ({
  useLedgerClock: jest.fn(() => ({ currentLedger: 1000, isLoading: false, error: null })),
}));

const toast = jest.requireMock("react-hot-toast").default as {
  success: jest.Mock;
  error: jest.Mock;
};
const { useLedgerClock } = jest.requireMock("../../lib/hooks/useLedgerClock") as {
  useLedgerClock: jest.Mock;
};

const requestWithdrawalWithSign = jest.fn().mockResolvedValue(7);
const claimWithdrawalWithSign = jest.fn().mockResolvedValue(undefined);

const mockClient = {
  requestWithdrawalWithSign,
  claimWithdrawalWithSign,
} as unknown as TreasuryStrategiesClient;

const baseStrategy: StrategyRow = {
  strategyId: 3,
  adapter: "CADAPTER123",
  token: "CTOKEN123",
  active: true,
  currentAllocation: BigInt(1000),
  registeredLedger: 10,
  maxAllocationBps: 5000,
  withdrawalCooldownLedgers: 100,
} satisfies StrategyRow & IndexedStrategy;

const defaultProps = {
  client: mockClient,
  strategy: baseStrategy,
  signerPublicKey: TREASURY_ADDRESS,
  signUnsignedXdr: jest.fn().mockResolvedValue("signed_xdr"),
  onClose: jest.fn(),
  onChanged: jest.fn(),
};

function amountInput() {
  return screen.getByPlaceholderText("1000") as HTMLInputElement;
}

function submitButton() {
  return screen.getByRole("button", { name: /request withdrawal/i });
}

describe("WithdrawalRequestModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestWithdrawalWithSign.mockResolvedValue(7);
    useLedgerClock.mockReturnValue({ currentLedger: 1000, isLoading: false, error: null });
  });

  describe("amount bounds against the current allocation", () => {
    it("rejects a non-numeric amount without calling the client", async () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "not-a-number");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Enter a whole-number amount"));
      expect(requestWithdrawalWithSign).not.toHaveBeenCalled();
    });

    it("rejects zero", async () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "0");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Amount must be positive and within the strategy's current allocation",
        ),
      );
      expect(requestWithdrawalWithSign).not.toHaveBeenCalled();
    });

    it("rejects an amount greater than the current allocation", async () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "1001");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Amount must be positive and within the strategy's current allocation",
        ),
      );
      expect(requestWithdrawalWithSign).not.toHaveBeenCalled();
    });

    it("accepts an amount exactly equal to the current allocation", async () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "1000");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() =>
        expect(requestWithdrawalWithSign).toHaveBeenCalledWith(
          TREASURY_ADDRESS,
          baseStrategy.strategyId,
          1000n,
          defaultProps.signUnsignedXdr,
        ),
      );
    });

    it("accepts an amount within the current allocation", async () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "250");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() => expect(requestWithdrawalWithSign).toHaveBeenCalledTimes(1));
      expect(requestWithdrawalWithSign.mock.calls[0][2]).toBe(250n);
    });
  });

  describe("authorized-caller case", () => {
    it("submits with whatever signerPublicKey it was given — the on-chain call itself enforces the treasury-only constraint", async () => {
      render(<WithdrawalRequestModal {...defaultProps} signerPublicKey={OTHER_WALLET} />);
      await userEvent.type(amountInput(), "100");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() => expect(requestWithdrawalWithSign).toHaveBeenCalledTimes(1));
      expect(requestWithdrawalWithSign.mock.calls[0][0]).toBe(OTHER_WALLET);
    });

    it("surfaces the contract's unauthorized-caller rejection as an error toast", async () => {
      requestWithdrawalWithSign.mockRejectedValueOnce(new Error("caller is not the treasury"));
      render(<WithdrawalRequestModal {...defaultProps} signerPublicKey={OTHER_WALLET} />);
      await userEvent.type(amountInput(), "100");
      fireEvent.submit(submitButton().closest("form")!);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Request failed: caller is not the treasury"),
      );
      // The dialog stays open and in the request form, not the "requested" state.
      expect(screen.getByRole("button", { name: /request withdrawal/i })).toBeInTheDocument();
    });
  });

  describe("busy/disabled state", () => {
    it("disables the submit button and shows a busy label while the request is in flight", async () => {
      let resolveRequest!: (id: number) => void;
      requestWithdrawalWithSign.mockReturnValueOnce(
        new Promise<number>((resolve) => {
          resolveRequest = resolve;
        }),
      );

      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "100");
      await userEvent.click(submitButton());

      await waitFor(() => expect(screen.getByRole("button", { name: /requesting/i })).toBeDisabled());

      resolveRequest(7);
      await waitFor(() => expect(screen.getByText(/withdrawal #7 requested/i)).toBeInTheDocument());
    });

    it("disables Claim until the cooldown has elapsed", async () => {
      useLedgerClock.mockReturnValue({ currentLedger: 1000, isLoading: false, error: null });
      render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "100");
      await userEvent.click(submitButton());

      await waitFor(() => expect(screen.getByText(/withdrawal #7 requested/i)).toBeInTheDocument());
      // withdrawalCooldownLedgers = 100, requested at ledger 1000 -> claimable at 1100; still at 1000.
      expect(screen.getByRole("button", { name: /^claim$/i })).toBeDisabled();
    });

    it("enables Claim once the cooldown has elapsed", async () => {
      const { rerender } = render(<WithdrawalRequestModal {...defaultProps} />);
      await userEvent.type(amountInput(), "100");
      await userEvent.click(submitButton());
      await waitFor(() => expect(screen.getByText(/withdrawal #7 requested/i)).toBeInTheDocument());
      expect(screen.getByRole("button", { name: /^claim$/i })).toBeDisabled();

      // Cooldown (100 ledgers) has now elapsed past the requested ledger (1000).
      useLedgerClock.mockReturnValue({ currentLedger: 1200, isLoading: false, error: null });
      rerender(<WithdrawalRequestModal {...defaultProps} />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^claim$/i })).not.toBeDisabled());
    });
  });

  describe("dialog semantics", () => {
    it("renders as a modal dialog with an accessible title", () => {
      render(<WithdrawalRequestModal {...defaultProps} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "withdrawal-request-modal-title");
      expect(screen.getByText("Request Withdrawal")).toBeInTheDocument();
    });

    it("calls onClose when Cancel is clicked", async () => {
      const onClose = jest.fn();
      render(<WithdrawalRequestModal {...defaultProps} onClose={onClose} />);
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when the close (✕) button is clicked", async () => {
      const onClose = jest.fn();
      render(<WithdrawalRequestModal {...defaultProps} onClose={onClose} />);
      await userEvent.click(screen.getByRole("button", { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose and onChanged after a successful claim", async () => {
      const onClose = jest.fn();
      const onChanged = jest.fn();
      const { rerender } = render(
        <WithdrawalRequestModal {...defaultProps} onClose={onClose} onChanged={onChanged} />,
      );
      await userEvent.type(amountInput(), "100");
      await userEvent.click(submitButton());
      await waitFor(() => expect(screen.getByText(/withdrawal #7 requested/i)).toBeInTheDocument());

      useLedgerClock.mockReturnValue({ currentLedger: 2000, isLoading: false, error: null });
      rerender(<WithdrawalRequestModal {...defaultProps} onClose={onClose} onChanged={onChanged} />);

      await waitFor(() => expect(screen.getByRole("button", { name: /^claim$/i })).not.toBeDisabled());
      await userEvent.click(screen.getByRole("button", { name: /^claim$/i }));

      await waitFor(() => expect(claimWithdrawalWithSign).toHaveBeenCalledWith(TREASURY_ADDRESS, 7, defaultProps.signUnsignedXdr));
      expect(onChanged).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
