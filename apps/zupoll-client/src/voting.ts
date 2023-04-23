import {
  openZuzaluMembershipPopup,
  usePassportPopupMessages,
} from "@pcd/passport-interface";
import { generateMessageHash } from "@pcd/semaphore-signature-pcd";
import { sha256 } from "js-sha256";
import stableStringify from "json-stable-stringify";
import { useCallback, useEffect, useRef, useState } from "react";
import { doVote } from "./api";
import {
  PollDefinition,
  UserType,
  VoteRequest,
  VoteSignal,
  ZupollError,
} from "./types";
import { PASSPORT_URL } from "./util";

enum VoteFormState {
  DEFAULT,
  AWAITING_PCDSTR,
  RECEIVED_PCDSTR,
}

/**
 * Returns a function that handles all logic pertaining to voting on a specific
 * vote option.
 *
 * @param poll Definition of the poll being voted on
 * @param onError Set to any error to display on ErrorOverlay
 * @param onVoted Set to new vote to reset poll feed after vote is confirmed
 * @param setServerLoading Set to true if we are waiting for server response
 * @returns
 */
export function usePollVote(
  poll: PollDefinition,
  onError: (err: ZupollError) => void,
  onVoted: (id: string) => void,
  setServerLoading: (loading: boolean) => void
): ((voteIdx: number) => Promise<void>) | null {
  const votingState = useRef<VoteFormState>(VoteFormState.DEFAULT);
  const [option, setOption] = useState<string>("-1");
  const [pcdStr, _passportPendingPCDStr] = usePassportPopupMessages();

  useEffect(() => {
    if (votingState.current === VoteFormState.AWAITING_PCDSTR) {
      votingState.current = VoteFormState.RECEIVED_PCDSTR;
    }
  }, [pcdStr]);

  useEffect(() => {
    if (votingState.current !== VoteFormState.RECEIVED_PCDSTR) return;
    if (option === "-1" || getVoted().includes(poll.id)) return;

    votingState.current = VoteFormState.DEFAULT;

    const parsedPcd = JSON.parse(decodeURIComponent(pcdStr));
    const request: VoteRequest = {
      pollId: poll.id,
      voterType: UserType.ANON,
      voterSemaphoreGroupUrl: poll.voterSemaphoreGroupUrls[0],
      voteIdx: parseInt(option),
      proof: parsedPcd.pcd,
    };

    async function doRequest() {
      setServerLoading(true);
      const res = await doVote(request);
      setServerLoading(false);

      if (res === undefined) {
        const serverDownError: ZupollError = {
          title: "Voting failed",
          message: "Server is down. Contact passport@0xparc.org.",
        };
        onError(serverDownError);
        return;
      }

      if (!res.ok) {
        const resErr = await res.text();
        console.error("error posting vote to the server: ", resErr);
        const err: ZupollError = {
          title: "Voting failed",
          message: `Server Error: ${resErr}`,
        };
        onError(err);
        return;
      }

      const newVote = await res.json();
      const newVoted = getVoted();
      newVoted.push(poll.id);
      setVoted(newVoted);
      setOption("-1");
      onVoted(newVote["id"]);
    }

    doRequest();
  }, [poll, pcdStr, option, onError, onVoted, setServerLoading]);

  const handleVote = useCallback(
    async (voteIdx: number) => {
      setOption(voteIdx.toString());
      votingState.current = VoteFormState.AWAITING_PCDSTR;

      if (!(voteIdx >= 0 && voteIdx < poll.options.length)) {
        const err: ZupollError = {
          title: "Voting failed",
          message: "Invalid option selected.",
        };
        onError(err);
        return;
      }

      const signal: VoteSignal = {
        pollId: poll.id,
        voteIdx: voteIdx,
      };
      const signalHash = sha256(stableStringify(signal));
      const sigHashEnc = generateMessageHash(signalHash).toString();
      const externalNullifier = generateMessageHash(poll.id).toString();

      openZuzaluMembershipPopup(
        PASSPORT_URL,
        window.location.origin + "/popup",
        poll.voterSemaphoreGroupUrls[0],
        "zupoll",
        sigHashEnc,
        externalNullifier
      );
    },
    [onError, poll.id, poll.options.length, poll.voterSemaphoreGroupUrls]
  );

  if (votedOn(poll.id)) return null;

  return handleVote;
}

export function votedOn(id: string): boolean {
  return getVoted().includes(id);
}

export function getVoted(): Array<string> {
  const voted: Array<string> = JSON.parse(
    window.localStorage.getItem("voted") || "[]"
  );
  return voted;
}

export function setVoted(voted: Array<string>) {
  window.localStorage.setItem("voted", JSON.stringify(voted));
}