import { BallotType } from ".prisma/client";
import { NextFunction, Request, Response } from "express";
import { JwtPayload, verify } from "jsonwebtoken";
import { IS_DEPLOYED } from "./deployment";
import { AuthType } from "./types";

export const ACCESS_TOKEN_SECRET = IS_DEPLOYED
  ? process.env.ACCESS_TOKEN_SECRET
  : "secret";

export const PARTICIPANTS_GROUP_ID = "1";
export const ADMIN_GROUP_ID = "4";
export const PCDPASS_GROUP_ID = "5";

const BASE_URL =
  process.env.IS_LOCAL_HTTPS === "true"
    ? "https://dev.local:3002"
    : "http://localhost:3002";

export const ZUZALU_PARTICIPANTS_GROUP_URL = IS_DEPLOYED
  ? process.env.ZUZALU_PARTICIPANTS_GROUP_URL
  : `${BASE_URL}/semaphore/${PARTICIPANTS_GROUP_ID}`;

export const ZUZALU_ORGANIZERS_GROUP_URL = IS_DEPLOYED
  ? process.env.ZUZALU_ORGANIZERS_GROUP_URL
  : `${BASE_URL}/semaphore/${ADMIN_GROUP_ID}`;

export const PCDPASS_USERS_GROUP_URL = IS_DEPLOYED
  ? process.env.PCDPASS_USERS_GROUP_URL
  : `${BASE_URL}/semaphore/${PCDPASS_GROUP_ID}`;

export const ZUZALU_HISTORIC_API_URL = IS_DEPLOYED
  ? process.env.SEMAPHORE_HISTORIC_URL
  : `${BASE_URL}/semaphore/valid-historic/`;

export const PCDPASS_HISTORIC_API_URL = IS_DEPLOYED
  ? process.env.PCDPASS_HISTORIC_API_URL
  : `${BASE_URL}/semaphore/valid-historic/`;

export interface GroupJwtPayload extends JwtPayload {
  groupUrl: string;
}
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1];

    verify(token, ACCESS_TOKEN_SECRET!, (err, group) => {
      if (err) {
        return res.sendStatus(403);
      }

      const payload = group as GroupJwtPayload;

      if (
        ZUZALU_PARTICIPANTS_GROUP_URL &&
        payload.groupUrl.includes(ZUZALU_PARTICIPANTS_GROUP_URL)
      ) {
        req.authUserType = AuthType.ZUZALU_PARTICIPANT;
        next();
        return;
      } else if (
        ZUZALU_ORGANIZERS_GROUP_URL &&
        payload.groupUrl.includes(ZUZALU_ORGANIZERS_GROUP_URL)
      ) {
        req.authUserType = AuthType.ZUZALU_ORGANIZER;
        next();
        return;
      } else if (
        PCDPASS_USERS_GROUP_URL &&
        payload.groupUrl.includes(PCDPASS_USERS_GROUP_URL)
      ) {
        req.authUserType = AuthType.PCDPASS;
        next();
        return;
      }

      return res.sendStatus(403);
    });
  } else {
    res.sendStatus(401);
  }
};

export function getVisibleBallotTypesForUser(
  userAuth: AuthType | undefined
): BallotType[] {
  let relevantBallots: BallotType[] = [];

  if (userAuth === AuthType.PCDPASS) {
    relevantBallots = [BallotType.PCDPASSUSER];
  } else if (userAuth === AuthType.ZUZALU_ORGANIZER) {
    relevantBallots = [
      BallotType.ADVISORYVOTE,
      BallotType.STRAWPOLL,
      BallotType.ORGANIZERONLY,
    ];
  } else if (userAuth === AuthType.ZUZALU_PARTICIPANT) {
    relevantBallots = [BallotType.ADVISORYVOTE, BallotType.STRAWPOLL];
  }

  return relevantBallots;
}
