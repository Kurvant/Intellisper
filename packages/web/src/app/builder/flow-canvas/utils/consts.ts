import {
  FLOW_CANVAS_HSPACE,
  FLOW_CANVAS_LOOP_VOFFSET,
  FLOW_CANVAS_ROUTER_VOFFSET,
  FLOW_CANVAS_STEP_HEIGHT,
  FLOW_CANVAS_STEP_WIDTH,
  FLOW_CANVAS_VSPACE,
  NoteColorVariant,
} from '@intelblocks/shared';

import { IbLoopReturnLineCanvasEdge as IbLoopReturnCanvasEdge } from '../edges/loop-return-edge';
import { IbLoopStartLineCanvasEdge as IbLoopStartCanvasEdge } from '../edges/loop-start-edge';
import { IbRouterEndCanvasEdge } from '../edges/router-end-edge';
import { IbRouterStartCanvasEdge } from '../edges/router-start-edge';
import { IbStraightLineCanvasEdge } from '../edges/straight-line-edge';
import { IbBigAddButtonCanvasNode } from '../nodes/big-add-button-node';
import IbGraphEndWidgetNode from '../nodes/flow-end-widget-node';
import IbLoopReturnCanvasNode from '../nodes/loop-return-node';
import { IbNoteCanvasNode } from '../nodes/note-node';
import { IbStepCanvasNode } from '../nodes/step-node';

import { flowCanvasLayoutConsts } from './layout-consts';
import { IbEdgeType, IbNodeType } from './types';

const ARC_LENGTH = flowCanvasLayoutConsts.ARC_LENGTH;
const ORIENTATION_LAYOUT = flowCanvasLayoutConsts.ORIENTATION_LAYOUT;
const STEP_NODE_SIZE = flowCanvasLayoutConsts.STEP_NODE_SIZE;
const ARC_LEFT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,0 -${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 ${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_LEFT_DOWN = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 -${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT_DOWN = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,0 ${ARC_LENGTH},${ARC_LENGTH}`;
const ARC_RIGHT_UP = `a${ARC_LENGTH},${ARC_LENGTH} 0 0,1 -${ARC_LENGTH},-${ARC_LENGTH}`;
const ARC_LEFT_UP = `a-${ARC_LENGTH},-${ARC_LENGTH} 0 0,0 ${ARC_LENGTH},-${ARC_LENGTH}`;
const ARROW_DOWN = 'm6 -6 l-6 6 m-6 -6 l6 6';
const VERTICAL_SPACE_BETWEEN_STEP_AND_LINE = 7;
const VERTICAL_SPACE_BETWEEN_STEPS = FLOW_CANVAS_VSPACE;
const VERTICAL_OFFSET_BETWEEN_LOOP_AND_CHILD = FLOW_CANVAS_LOOP_VOFFSET;
const LABEL_HEIGHT = 30;
const LABEL_VERTICAL_PADDING = 12;
const STEP_DRAG_OVERLAY_WIDTH = 75;
const STEP_DRAG_OVERLAY_HEIGHT = 75;
const NOTE_CREATION_OVERLAY_WIDTH = 150;
const NOTE_CREATION_OVERLAY_HEIGHT = 150;
const VERTICAL_OFFSET_BETWEEN_ROUTER_AND_CHILD = FLOW_CANVAS_ROUTER_VOFFSET;
const LINE_WIDTH = 1.5;
const DRAGGED_STEP_TAG = 'dragged-step';
const DRAGGED_NOTE_TAG = 'dragged-note';
const HORIZONTAL_SPACE_BETWEEN_NODES = FLOW_CANVAS_HSPACE;
const AP_NODE_SIZE: Record<
  Exclude<IbNodeType, IbNodeType.GRAPH_START_WIDGET | IbNodeType.NOTE>,
  { height: number; width: number }
> = {
  [IbNodeType.BIG_ADD_BUTTON]: {
    height: 50,
    width: 50,
  },
  [IbNodeType.ADD_BUTTON]: {
    height: 20,
    width: 20,
  },
  [IbNodeType.STEP]: {
    height: FLOW_CANVAS_STEP_HEIGHT,
    width: FLOW_CANVAS_STEP_WIDTH,
  },
  [IbNodeType.LOOP_RETURN_NODE]: {
    height: FLOW_CANVAS_STEP_HEIGHT,
    width: FLOW_CANVAS_STEP_WIDTH,
  },
  [IbNodeType.GRAPH_END_WIDGET]: {
    height: 0,
    width: 0,
  },
};

export const flowCanvasConsts = {
  ARC_LENGTH,
  ORIENTATION_LAYOUT,
  STEP_NODE_SIZE,
  ARC_LEFT,
  ARC_RIGHT,
  ARC_LEFT_DOWN,
  ARC_RIGHT_DOWN,
  VERTICAL_OFFSET_BETWEEN_LOOP_AND_CHILD,
  AP_NODE_SIZE,
  VERTICAL_SPACE_BETWEEN_STEP_AND_LINE,
  ARROW_DOWN,
  VERTICAL_SPACE_BETWEEN_STEPS,
  ARC_RIGHT_UP,
  LINE_WIDTH,
  LABEL_HEIGHT,
  ARC_LEFT_UP,
  VERTICAL_OFFSET_BETWEEN_ROUTER_AND_CHILD,

  doesNodeAffectBoundingBox: flowCanvasLayoutConsts.doesNodeAffectBoundingBox,
  edgeTypes: {
    [IbEdgeType.STRAIGHT_LINE]: IbStraightLineCanvasEdge,
    [IbEdgeType.LOOP_START_EDGE]: IbLoopStartCanvasEdge,
    [IbEdgeType.LOOP_RETURN_EDGE]: IbLoopReturnCanvasEdge,
    [IbEdgeType.ROUTER_START_EDGE]: IbRouterStartCanvasEdge,
    [IbEdgeType.ROUTER_END_EDGE]: IbRouterEndCanvasEdge,
  },
  nodeTypes: {
    [IbNodeType.STEP]: IbStepCanvasNode,
    [IbNodeType.LOOP_RETURN_NODE]: IbLoopReturnCanvasNode,
    [IbNodeType.BIG_ADD_BUTTON]: IbBigAddButtonCanvasNode,
    [IbNodeType.GRAPH_END_WIDGET]: IbGraphEndWidgetNode,
    [IbNodeType.NOTE]: IbNoteCanvasNode,
  },
  DRAGGED_STEP_TAG,
  DRAGGED_NOTE_TAG,
  HORIZONTAL_SPACE_BETWEEN_NODES,
  HANDLE_STYLING: { opacity: 0, cursor: 'default' },
  LABEL_VERTICAL_PADDING,
  STEP_DRAG_OVERLAY_WIDTH,
  STEP_DRAG_OVERLAY_HEIGHT,
  NOTE_CREATION_OVERLAY_WIDTH,
  NOTE_CREATION_OVERLAY_HEIGHT,
  STEP_CONTEXT_MENU_ATTRIBUTE: 'step-context-menu',
  SELECTION_RECT_CHEVRON_ATTRIBUTE: 'selection-rect-chevron',
  NODE_SELECTION_RECT_CLASS_NAME:
    flowCanvasLayoutConsts.NODE_SELECTION_RECT_CLASS_NAME,
  SIDEBAR_ANIMATION_DURATION: 200,
  DEFAULT_NOTE_CONTENT: '<br>',
  DEFAULT_NOTE_COLOR: NoteColorVariant.BLUE,
  BUILDER_HEADER_HEIGHT: 60,
};
