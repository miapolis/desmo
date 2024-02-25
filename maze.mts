import type { MacroAPI } from "desmoscript/dist/macro/macro-api";

export default function ({ addMacro, addLatexMacro }) {
  const { cells, polygons, parametrics } = createOptimizedMaze();

  addMacro({
    name: "maze",
    fn: (node, a) => {
      const walls = cells.map((cell) => cell.walls).flat();
      return a.parseExpr(`[${walls.join(",")}]`);
    },
  });

  addMacro({
    name: "polygonData",
    fn: (node, a) => {
      return a.parseExpr(`[${polygons.join(",")}]`);
    },
  });

  addMacro({
    name: "parametricData",
    fn: (node, a) => {
      return a.parseExpr(`[${parametrics.join(",")}]`);
    },
  });

  const unstable_parseIdent = (ident: string) => {
    return `${ident.charAt(0).toUpperCase()}_{${ident.substring(1)}}`;
  };

  addLatexMacro({
    name: "length",
    fn: (node, a: MacroAPI) => {
      return `\\operatorname{length}\\left(${unstable_parseIdent(
        node.params[0].segments[0]
      )}\\right)`;
    },
  });

  addLatexMacro({
    name: "tau",
    fn: (node, a: MacroAPI) => {
      return "2\\pi";
    },
  });

  addLatexMacro({
    name: "gameLoopLatex",
    fn: (node, a: MacroAPI) => {
      return "G_{ameLoop}\\left(\\operatorname{dt}\\right)";
    },
  });
}

const GRID_SIZE = 12;
const CELL_COUNT = GRID_SIZE ** 2;

const FIRST_CELL = "FIRST_CELL";
const LAST_COORD = `${GRID_SIZE - 1},${GRID_SIZE - 1}`;
const START = "START";
const FINISH = "FINISH";

const cellMarkers = new Map([
  [FIRST_CELL, (cell: Cell) => cell.visit()], // first cell is inherently visited
  ["0,0", (cell: Cell) => cell.markAsStart()],
  [LAST_COORD, (cell: Cell) => cell.markAsFinish()],
]);

export const createOptimizedMaze = () => {
  const rows = generateMaze() as Cell[][];
  const columns = transposeArray(rows);

  const cells = rows.flat();
  // Remove outer most walls
  for (const cell of cells) {
    if (cell.col == 0) cell.walls[3] = 0;
    if (cell.col == GRID_SIZE - 1) cell.walls[1] = 0;
    if (cell.row == 0) cell.walls[0] = 0;
    if (cell.row == GRID_SIZE - 1) cell.walls[2] = 0;
  }

  interface WallGroup {
    type: "row" | "column";
    index: number;
    start: number;
    length: number;
    depth?: number;
  }

  const consolidatedWalls = new Array<WallGroup>();

  // .entries() seems to be broken for the macros compiler target, use a manual index instead
  let i = 0;
  for (const cells of rows) {
    const transformed = groupConsecutives(cells.map((cell) => cell.walls[1]));
    consolidatedWalls.push(
      ...transformed.map((group) => ({
        type: "row" as const,
        index: i + 1,
        start: group.index,
        length: group.length,
      }))
    );
    i++;
  }

  let k = 0;
  for (const cells of columns) {
    // Get the right walls of all the cells
    const transformed = groupConsecutives(cells.map((cell) => cell.walls[0]));
    consolidatedWalls.push(
      ...transformed.map((group) => ({
        type: "column" as const,
        index: k,
        start: group.index,
        length: group.length,
      }))
    );
    k++;
  }

  // Split every wall into one-cell wide walls
  const polygonTiles = new Array<WallGroup>();
  for (const wall of consolidatedWalls) {
    if (wall.length === 1) {
      polygonTiles.push(wall);
    } else {
      for (let j = 0; j < wall.length; j++) {
        polygonTiles.push({
          type: wall.type,
          index: wall.index,
          start: wall.start + j,
          length: 1,
        });
      }
    }
  }

  // Painter's algorithm https://en.wikipedia.org/wiki/Painter%27s_algorithm
  // Sort all of the rows and columns by the "highest" isometric points first or the "depth"
  // This is to ensure that the walls are drawn in the correct order
  const getOrderEval = (w: WallGroup) => {
    if (w.type == "row") {
      // If it's a row, the "highest" point is a low row index and a high start value
      return -1 * w.index + w.start;
    } else {
      // For a column the "highest" point is a high column index and a low start value
      return w.index - w.start;
    }
  };

  polygonTiles.sort((a, b) => getOrderEval(b) - getOrderEval(a));

  const polygons = polygonTiles
    .map((w) => [w.type == "row" ? 0 : 1, w.index, w.start])
    .flat();
  const parametrics = consolidatedWalls
    .map((w) => [w.type == "row" ? 0 : 1, w.index, w.start, w.length])
    .flat();

  return { cells, polygons, parametrics };
};

export const generateMaze = (
  cells = generateCells(),
  cell = getRandomCell(cells),
  stack = createStack(),
  visitedCount = 0
) => {
  const neighbor = getUnvisitedNeighbor(cells, cell);
  const nextCell = neighbor || stack.pop();
  const increment = neighbor ? 1 : 0;

  markCell(cell, visitedCount);

  if (neighbor) {
    neighbor.visit(cell);
    stack.push(neighbor);
  }

  return visitedCount == CELL_COUNT - 1
    ? cells
    : generateMaze(cells, nextCell, stack, visitedCount + increment);
};

const createFilledArray = (length: number, predicate: any) =>
  Array(length)
    .fill(null)
    .map((_, i) => predicate(i));

const generateCells = (): Cell[] => {
  return createFilledArray(GRID_SIZE, (col: number) =>
    createFilledArray(GRID_SIZE, (row: number) => new Cell(col, row))
  );
};

const markCell = (cell: Cell, visitedCount: number) => {
  const key = visitedCount == 0 ? FIRST_CELL : cell.toString();
  if (cellMarkers.has(key)) {
    cellMarkers.get(key)!(cell);
  }
};

export class Cell {
  col = 0;
  row = 0;

  isVisited = false;
  type: string | null = null;
  walls = createWalls();

  constructor(col: number, row: number) {
    this.col = col;
    this.row = row;
  }

  visit(neighbor?: Cell) {
    this.isVisited = true;
    if (neighbor) {
      this.walls = toggleWallBits(this, neighbor);
      neighbor.walls = toggleWallBits(neighbor, this);
    }
  }

  markAsStart() {
    this.type = START;
  }
  markAsFinish() {
    this.type = FINISH;
  }
  toString() {
    return `${this.col},${this.row}`;
  }
}

const wallDeletionComputations: ((cell: Cell, neighbor: Cell) => number)[] = [
  (cell, neighbor) => (neighbor.row < cell.row ? 1 : 0),
  (cell, neighbor) => (neighbor.col > cell.col ? 1 : 0),
  (cell, neighbor) => (neighbor.row > cell.row ? 1 : 0),
  (cell, neighbor) => (neighbor.col < cell.col ? 1 : 0),
];

const createWalls = () => [1, 1, 1, 1]; // top-right-bottom-left - transformed via bit mask

const toggleWallBits = (cell: Cell, neighbor: Cell) =>
  cell.walls.map((bit, i) => bit ^ wallDeletionComputations[i](cell, neighbor));

const getRandomNumber = (max = 1, method = "round") =>
  Math[method](Math.random() * max);

const getRandomCell = (cells: Cell[]) =>
  cells[getRandomNumber(GRID_SIZE - 1)][getRandomNumber(GRID_SIZE - 1)];

const getUnvisitedNeighbors = (
  cells: Cell[],
  { col, row }: { col: number; row: number }
) => {
  const previousColumn = col > 0 ? cells[col - 1][row] : null;
  const previousRow = row > 0 ? cells[col][row - 1] : null;
  const nextColumn = col < GRID_SIZE - 1 ? cells[col + 1][row] : null;
  const nextRow = row < GRID_SIZE - 1 ? cells[col][row + 1] : null;

  return [previousColumn, previousRow, nextColumn, nextRow]
    .filter(Boolean)
    .filter((cell) => !cell.isVisited);
};

const getUnvisitedNeighbor = (cells: Cell[], cell: Cell) => {
  const neighbours = getUnvisitedNeighbors(cells, cell);
  return neighbours[getRandomNumber(neighbours.length, "floor")] || null;
};

const createStack = <T extends never>() => {
  const items = [];
  const push = (item) => items.push(item as T);
  const pop = () => items.pop();

  return {
    push,
    pop,
  };
};

type LengthIndexPair = { index: number; length: number };

const groupConsecutives = (arr: number[]): LengthIndexPair[] => {
  const result: LengthIndexPair[] = [];
  let length = 0;
  let startIndex = -1;

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 1) {
      length++;
      if (startIndex === -1) {
        startIndex = i;
      }
    }
    if (arr[i] === 0 || i === arr.length - 1) {
      if (length > 0) {
        result.push({ index: startIndex, length: length });
        length = 0;
        startIndex = -1;
      }
    }
  }

  return result;
};

// prettier-ignore
const transposeArray = <T,>(matrix: T[][]): T[][] => {
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
};
