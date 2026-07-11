import {
  FlowAction,
  StepLocationRelativeToParent,
  FlowTrigger,
  Note,
} from '@intelblocks/shared';
import { Edge } from '@xyflow/react';

export enum IbNodeType {
  STEP = 'STEP',
  ADD_BUTTON = 'ADD_BUTTON',
  BIG_ADD_BUTTON = 'BIG_ADD_BUTTON',
  GRAPH_END_WIDGET = 'GRAPH_END_WIDGET',
  GRAPH_START_WIDGET = 'GRAPH_START_WIDGET',
  /**Used for calculating the loop graph width */
  LOOP_RETURN_NODE = 'LOOP_RETURN_NODE',
  NOTE = 'NOTE',
}
export type IbBoundingBox = {
  width: number;
  height: number;
  left: number;
  right: number;
};

export type IbStepNode = {
  id: string;
  type: IbNodeType.STEP;
  position: {
    x: number;
    y: number;
  };
  data: {
    step: FlowAction | FlowTrigger;
  };
  selectable?: boolean;
  style?: React.CSSProperties;
  draggable?: boolean;
};

export type IbNoteNode = {
  id: string;
  type: IbNodeType.NOTE;
  position: {
    x: number;
    y: number;
  };
  data: Pick<Note, 'content' | 'ownerId' | 'color' | 'size'>;
};

export type IbLoopReturnNode = {
  id: string;
  type: IbNodeType.LOOP_RETURN_NODE;
  position: {
    x: number;
    y: number;
  };
  data: Record<string, never>;
  selectable?: boolean;
};

export type IbButtonData = {
  edgeId: string;
} & (
  | {
      parentStepName: string;
      stepLocationRelativeToParent:
        | StepLocationRelativeToParent.AFTER
        | StepLocationRelativeToParent.INSIDE_LOOP
        | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
        | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
    }
  | {
      parentStepName: string;
      stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
      branchIndex: number;
    }
);

export type IbBigAddButtonNode = {
  id: string;
  type: IbNodeType.BIG_ADD_BUTTON;
  position: {
    x: number;
    y: number;
  };
  data: IbButtonData;
  selectable?: boolean;
  style?: React.CSSProperties;
};

export type IbGraphEndNode = {
  id: string;
  type: IbNodeType.GRAPH_END_WIDGET;
  position: {
    x: number;
    y: number;
  };
  data: {
    showWidget?: boolean;
  };
  selectable?: boolean;
};

export type IbNode =
  | IbStepNode
  | IbGraphEndNode
  | IbBigAddButtonNode
  | IbLoopReturnNode
  | IbNoteNode;

export enum IbEdgeType {
  STRAIGHT_LINE = 'IbStraightLineEdge',
  LOOP_START_EDGE = 'IbLoopStartEdge',
  LOOP_CLOSE_EDGE = 'IbLoopCloseEdge',
  LOOP_RETURN_EDGE = 'IbLoopReturnEdge',
  ROUTER_START_EDGE = 'IbRouterStartEdge',
  ROUTER_END_EDGE = 'IbRouterEndEdge',
}

export type IbStraightLineEdge = Edge & {
  type: IbEdgeType.STRAIGHT_LINE;
  data: {
    drawArrowHead: boolean;
    hideAddButton?: boolean;
    parentStepName: string;
  };
};

export type IbLoopStartEdge = Edge & {
  type: IbEdgeType.LOOP_START_EDGE;
  data: {
    isLoopEmpty: boolean;
  };
};

export type IbLoopCloseEdge = Edge & {
  type: IbEdgeType.LOOP_CLOSE_EDGE;
};

export type IbLoopReturnEdge = Edge & {
  type: IbEdgeType.LOOP_RETURN_EDGE;
  data: {
    parentStepName: string;
    isLoopEmpty: boolean;
    drawArrowHeadAfterEnd: boolean;
    verticalSpaceBetweenReturnNodeStartAndEnd: number;
  };
};

export type IbRouterStartEdge = Edge & {
  type: IbEdgeType.ROUTER_START_EDGE;
  data: {
    isBranchEmpty: boolean;
    label: string;
    drawHorizontalLine: boolean;
    drawStartingVerticalLine: boolean;
  } & (
    | {
        stepLocationRelativeToParent: StepLocationRelativeToParent.INSIDE_BRANCH;
        branchIndex: number;
      }
    | {
        stepLocationRelativeToParent:
          | StepLocationRelativeToParent.INSIDE_ON_SUCCESS_BRANCH
          | StepLocationRelativeToParent.INSIDE_ON_FAILURE_BRANCH;
      }
  );
};

export type IbRouterEndEdge = Edge & {
  type: IbEdgeType.ROUTER_END_EDGE;
  data: {
    drawHorizontalLine: boolean;
    verticalSpaceBetweenLastNodeInBranchAndEndLine: number;
  } & (
    | {
        routerOrBranchStepName: string;
        drawEndingVerticalLine: true;
        isNextStepEmpty: boolean;
      }
    | {
        drawEndingVerticalLine: false;
      }
  );
};

export type IbEdge =
  | IbLoopStartEdge
  | IbLoopReturnEdge
  | IbStraightLineEdge
  | IbRouterStartEdge
  | IbRouterEndEdge;
export type IbGraph = {
  nodes: IbNode[];
  edges: IbEdge[];
};

export type CanvasOrientation = 'vertical' | 'horizontal';
