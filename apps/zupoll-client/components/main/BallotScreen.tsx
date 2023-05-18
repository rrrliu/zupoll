import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { listBallotPolls } from "../../src/api";
import {
  getBallotVotes,
  useBallotVoting,
  votedOn,
} from "../../src/ballotVoting";
import { useLogin } from "../../src/login";
import { Ballot } from "../../src/prismaTypes";
import { BallotPollResponse, PollWithCounts } from "../../src/requestTypes";
import { ZupollError } from "../../src/types";
import { Center } from "../core";
import { ReturnHeader } from "../core/Headers";
import {
  RippleLoaderLight,
  RippleLoaderLightMargin,
} from "../core/RippleLoader";
import { BallotPoll } from "./BallotPoll";
import { ErrorOverlay } from "./ErrorOverlay";

export function BallotScreen({ ballotURL }: { ballotURL: string }) {
  const router = useRouter();
  const [error, setError] = useState<ZupollError>();
  const [serverLoading, setServerLoading] = useState<boolean>(false);
  const { token, group: _group, loadingToken, logout } = useLogin(router);

  /**
   * BALLOT/POLL LOGIC
   */
  const [loadingPolls, setLoadingPolls] = useState<boolean>(false);
  const [polls, setPolls] = useState<Array<PollWithCounts>>([]);
  const [ballot, setBallot] = useState<Ballot>();
  const [ballotId, setBallotId] = useState<string>("");
  const [ballotVoterSemaphoreGroupUrl, setBallotVoterSemaphoreGroupUrl] =
    useState<string>("");
  const [expired, setExpired] = useState<boolean>(false);
  const [refresh, setRefresh] = useState<string>("");

  // Retrieve polls under this ballot, refresh after user votes
  useEffect(() => {
    if (!token) {
      setPolls([]);
      return;
    }

    async function getBallotPolls() {
      setLoadingPolls(true);
      const res = await listBallotPolls(token, ballotURL);
      setLoadingPolls(false);

      if (res === undefined) {
        const serverDownError: ZupollError = {
          title: "Retrieving polls failed",
          message: "Server is down. Contact passport@0xparc.org.",
        };
        setError(serverDownError);
        return;
      }

      if (res.status === 403) {
        logout();
        return;
      }

      if (!res.ok) {
        const resErr = await res.text();
        console.error("error posting vote to the server: ", resErr);
        const err: ZupollError = {
          title: "Retreiving polls failed",
          message: `Server Error: ${resErr}`,
        };
        setError(err);
        return;
      }

      const ballotPollResponse: BallotPollResponse = await res.json();
      console.log(ballotPollResponse);

      // reorder+reformat polls if there's a poll order in the options
      if (ballotPollResponse.polls.length > 0) {
        const firstPollOptions = ballotPollResponse.polls[0].options;
        if (
          firstPollOptions[firstPollOptions.length - 1].startsWith(
            "poll-order-"
          )
        ) {
          const newPolls: PollWithCounts[] = [];

          // Sorting polls by poll-order-<idx> option
          for (let idx = 0; idx < ballotPollResponse.polls.length; idx++) {
            for (let i = 0; i < ballotPollResponse.polls.length; i++) {
              const poll = ballotPollResponse.polls[i];
              const lastOption = poll.options[poll.options.length - 1];
              if (lastOption === `poll-order-${idx}`) {
                newPolls.push(poll);
                break;
              }
            }
          }

          // Remove poll-order-<idx> option from polls
          for (let i = 0; i < newPolls.length; i++) {
            newPolls[i].options.pop();
          }
          setPolls(newPolls);
        } else {
          setPolls(ballotPollResponse.polls);
        }
      } else {
        console.error("No polls found in ballot");
        const err: ZupollError = {
          title: "Retreiving polls failed",
          message: `No polls found in ballot`,
        };
        setError(err);
        return;
      }

      setBallot(ballotPollResponse.ballot);
      setBallotId(ballotPollResponse.ballot.ballotId);
      setBallotVoterSemaphoreGroupUrl(
        ballotPollResponse.ballot.voterSemaphoreGroupUrls[0]
      );
      setExpired(new Date(ballotPollResponse.ballot.expiry) < new Date());
    }

    getBallotPolls();
  }, [token, ballotURL, logout, refresh]);

  /**
   * VOTING LOGIC
   */
  const [canVote, setCanVote] = useState<boolean>(true);
  const [pollToVote, setPollToVote] = useState(
    new Map<string, number | undefined>()
  );

  // check voting status
  useEffect(() => {
    setCanVote(!votedOn(ballotId) && !expired);
  }, [expired, ballotId, refresh]);

  // update votes for polls
  const onVoted = (pollId: string, voteIdx: number) => {
    const currentVote = pollToVote.get(pollId);
    if (currentVote !== undefined) {
      if (currentVote === voteIdx) {
        setPollToVote(new Map(pollToVote.set(pollId, undefined)));
        return;
      }
    }
    setPollToVote(new Map(pollToVote.set(pollId, voteIdx)));
  };

  const createBallotVotePCD = useBallotVoting({
    ballotId,
    ballotURL,
    ballotVoterSemaphoreGroupUrl,
    polls,
    pollToVote,
    onError: (err: ZupollError) => {
      setError(err);
      setServerLoading(false);
    },
    setServerLoading,
    refresh: (id: string) => {
      setPollToVote(new Map());
      setRefresh(id);
    },
  });

  return (
    <>
      <Head>
        <title>{ballot === undefined ? "Zupoll" : ballot.ballotTitle}</title>
        <link rel="Zupoll icon" href="/zupoll-icon.ico" />
      </Head>
      <Center>
        <ReturnHeader />
        {loadingToken ||
        loadingPolls ||
        ballot === undefined ||
        polls === undefined ? (
          <RippleLoaderLight />
        ) : (
          <>
            {canVote ? (
              <TextContainer>
                <div>🚨</div>
                <div>
                  If you created or reset your passport after this poll was created 
                  you will not be able to vote 😢. This is to prevent people from
                  double-voting.
                </div>
              </TextContainer>
            ) : (
              <></>
            )}
            <Container>
              <h2>{ballot.ballotTitle}</h2>
              <p>{ballot.ballotDescription}</p>
              {ballot.expiry &&
                ballot.createdAt &&
                (new Date(ballot.expiry) < new Date() ? (
                  <p style={{ color: "red" }}>This ballot has expired.</p>
                ) : (
                  <>
                    <p>
                      <b>Created</b>{" "}
                      {" " + new Date(ballot.createdAt).toLocaleString()}
                    </p>
                    <p>
                      <b>Expires</b>{" "}
                      {" " + new Date(ballot.expiry).toLocaleString()}
                    </p>
                  </>
                ))}
            </Container>
            {polls.map((poll) => (
              <BallotPoll
                key={poll.id}
                canVote={canVote}
                poll={poll}
                voteIdx={pollToVote.get(poll.id)}
                finalVoteIdx={getBallotVotes(ballotId)[poll.id]}
                onVoted={onVoted}
              />
            ))}
          </>
        )}

        {canVote && ballot !== undefined ? (
          serverLoading ? (
            <RippleLoaderLightMargin />
          ) : (
            <BallotButton onClick={createBallotVotePCD}>
              <h3>Submit ballot</h3>
            </BallotButton>
          )
        ) : (
          <></>
        )}

        {error && (
          <ErrorOverlay
            error={error}
            onClose={() => {
              setError(undefined);
            }}
          />
        )}
      </Center>
    </>
  );
}

const TextContainer = styled.div`
  display: flex;
  color: white;
  gap: 1rem;
  font-size: 1rem;
  margin-bottom: 1.5rem;
`;

const Container = styled.div`
  box-sizing: border-box;
  font-family: OpenSans;
  border: 1px solid #bbb;
  background-color: #eee;
  width: 100%;
  border-radius: 1rem;
  padding: 1rem 2rem 2rem 2rem;
  margin-bottom: 1.5rem;
`;

const BallotButton = styled.div`
  font-family: OpenSans;
  border-radius: 1rem;
  padding: 0.25rem;
  margin-bottom: 1.5rem;
  text-align: center;
  cursor: pointer;
  background-color: #52b5a4;

  &:hover {
    background-color: #449c8d;
  }

  &:active {
    background-color: #378073;
  }
`;
