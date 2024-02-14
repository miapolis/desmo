export default function ({ scope, addMacro }) {
  addMacro({
    name: "maze",
    fn: (node, a) => {
      const cells = generateMaze().flat();
      const walls = cells.map((cell) => cell.walls).flat();
      return a.parseExpr(`[${walls.join(",")}]`);
    },
  });
}

const GRID_SIZE = 20;
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

const generateCells = () => {
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
