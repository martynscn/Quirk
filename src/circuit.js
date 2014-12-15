/** @type {!number} */
var CIRCUIT_OP_HORIZONTAL_SPACING = 10;
/** @type {!number} */
var CIRCUIT_OP_LEFT_SPACING = 10;

/**
 * @param {!int} i
 * @returns {!string}
 */
var WIRE_LABELLER = function (i) {
    if (i === 0) { return "A1"; }
    if (i === 1) { return "A2"; }
    if (i === 2) { return "B1"; }
    if (i === 3) { return "B2"; }
    return "bit" + i;
};

/**
 *
 * @param {!Rect} area
 * @param {!int} numWires
 * @param {!Array.<!GateColumn>} columns
 * @param {?int} compressedColumnIndex
 *
 * @property {!Rect} area
 * @property {!int} numWires
 * @property {!Array.<!GateColumn>} columns;
 * @property {?int} compressedColumnIndex
 *
 * @constructor
 */
function Circuit(area, numWires, columns, compressedColumnIndex) {
    need(numWires >= 0, "numWires >= 0");
    this.area = area;
    this.numWires = numWires;
    this.columns = columns;
    this.compressedColumnIndex = compressedColumnIndex;
}

/**
 * @returns {!Matrix}
 */
Circuit.prototype.makeInputState = function() {
    return Matrix.col([1, 0]).tensorPower(this.numWires);
};

/**
 * @returns {!Array.<!Matrix>}
 */
Circuit.prototype.getStatesThroughout = function() {
    return scan(
        this.columns,
        this.makeInputState(),
        function(a, e) { return e.transform(a); });
};

/**
 * @param {!int} wireIndex
 * @returns {!Rect}
 */
Circuit.prototype.wireRect = function (wireIndex) {
    need(wireIndex >= 0 && wireIndex < this.numWires, "wireIndex out of range");
    var wireHeight = this.area.h / this.numWires;
    return this.area.skipTop(wireHeight * wireIndex).takeTop(wireHeight);
};

/**
 * @param {!Point} p
 * @returns {?int}
 */
Circuit.prototype.findWireAt = function (p) {
    if (!this.area.containsPoint(p)) {
        return null;
    }

    return Math.floor((p.y - this.area.y) * this.numWires / this.area.h);
};

/**
 * @param {!Point} p
 * @returns {?number}
 */
Circuit.prototype.findOpHalfColumnAt = function(p) {
    if (!this.area.containsPoint(p)) {
        return null;
    }

    var s = CIRCUIT_OP_HORIZONTAL_SPACING/2;
    return Math.floor((p.x - this.area.x - CIRCUIT_OP_LEFT_SPACING) / s - 0.5) / 2;
};

/**
 * @param {!Point} p
 * @returns {?int}
 */
Circuit.prototype.findExistingOpColumnAt = function(p) {
    if (!this.area.containsPoint(p)) {
        return null;
    }

    var i = Math.floor((p.x - this.area.x - CIRCUIT_OP_LEFT_SPACING) / CIRCUIT_OP_HORIZONTAL_SPACING);
    if (i < 0 || i >= this.columns.length) {
        return null;
    }
    return i;
};

/**
 * @param {!Hand} hand
 * @returns {?{ col : !number, row : !number, isInsert : !boolean }}
 */
Circuit.prototype.findModificationIndex = function (hand) {
    if (hand.pos === null) {
        return null;
    }
    var halfColIndex = this.findOpHalfColumnAt(hand.pos);
    if (halfColIndex === null) {
        return null;
    }
    var wireIndex = notNull(this.findWireAt(hand.pos));
    var colIndex = Math.ceil(halfColIndex);
    var isInsert = halfColIndex % 1 === 0.5;
    if (colIndex >= this.columns.length) {
        return {col: colIndex, row: wireIndex, isInsert: false};
    }

    if (!isInsert) {
        var isFree = this.columns[colIndex].gates[wireIndex] === null;
        if (hand.heldGateBlock !== null) {
            for (var k = 1; k < hand.heldGateBlock.gates.length; k++) {
                if (this.columns[colIndex].gates[wireIndex + k] !== null) {
                    isFree = false;
                }
            }
        }
        if (!isFree) {
            var isAfter = hand.pos.x < this.opRect(colIndex).center().x;
            isInsert = true;
            if (isAfter) {
                colIndex += 1;
            }
        }
    }

    return {col: colIndex, row: wireIndex, isInsert: isInsert};
};

/**
 * @param {!int} operationIndex
 * @returns {Rect!}
 */
Circuit.prototype.opRect = function (operationIndex) {
    var opWidth = GATE_RADIUS * 2;
    var opSeparation = opWidth + CIRCUIT_OP_HORIZONTAL_SPACING;
    var tweak = 0;
    if (operationIndex !== null && operationIndex === this.compressedColumnIndex) {
        tweak = opSeparation/2;
    }
    if (operationIndex !== null && operationIndex > this.compressedColumnIndex) {
        tweak = operationIndex;
    }

    var x = opSeparation * operationIndex - tweak + CIRCUIT_OP_LEFT_SPACING;
    return this.area.skipLeft(x).takeLeft(opWidth);
};

/**
 * @param {!int} wireIndex
 * @param {!int} operationIndex
 */
Circuit.prototype.gateRect = function (wireIndex, operationIndex) {
    var op = this.opRect(operationIndex);
    var wire = this.wireRect(wireIndex);
    return Rect.centeredSquareWithRadius(new Point(op.x + GATE_RADIUS, wire.center().y), GATE_RADIUS);
};

/**
 *
 * @param {!Painter} painter
 * @param {!Hand} hand
 * @param {!boolean} isTapping
 */
Circuit.prototype.paint = function(painter, hand, isTapping) {
    var inputState = this.makeInputState();

    // Draw labelled wires
    for (var i = 0; i < this.numWires; i++) {
        var wireY = this.wireRect(i).center().y;
        painter.printCenteredText(WIRE_LABELLER(i) + ":", {x: this.area.x + 14, y: wireY});
        painter.strokeLine({x: this.area.x + 30, y: wireY}, {x: this.area.x + this.area.w, y: wireY});
    }

    // Draw operations
    for (var i2 = 0; i2 < this.columns.length; i2++) {
        inputState = this.columns[i2].matrix().times(inputState);
        this.drawCircuitOperation(painter, this.columns[i2], i2, inputState, hand, isTapping);
    }
};

/**
 * @param {!Painter} painter
 * @param {!GateColumn} gateColumn
 * @param {!int} columnIndex
 * @param {!Matrix} columnState A complex column vector.
 * @param {!Hand} hand
 * @param {!boolean} isTapping
 */
Circuit.prototype.drawCircuitOperation = function (painter, gateColumn, columnIndex, columnState, hand, isTapping) {

    this.drawColumnControlWires(painter, gateColumn, columnIndex);

    for (var i = 0; i < this.numWires; i++) {
        var b = this.gateRect(i, columnIndex);

        if (gateColumn.gates[i] === null) {
            continue;
        }
        //noinspection JSValidateTypes
        /** @type {!Gate} */
        var gate = gateColumn.gates[i];

        //var isHolding = hand.pos !== null && hand.col === columnIndex && hand.row === i;
        var canGrab = hand.pos !== null && b.containsPoint(hand.pos) && hand.heldGateBlock === null && !isTapping;
        gate.paint(painter, b, false, canGrab, new CircuitContext(gateColumn, i, columnState));
    }
};

/**
 * @param {!Painter} painter
 * @param {!GateColumn} gateColumn
 * @param {!int} columnIndex
 */
Circuit.prototype.drawColumnControlWires = function (painter, gateColumn, columnIndex) {
    var hasControls = gateColumn.gates.indexOf(Gate.CONTROL) > -1;
    var hasAntiControls = gateColumn.gates.indexOf(Gate.ANTI_CONTROL) > -1;
    var hasSwaps = gateColumn.gates.indexOf(Gate.SWAP_HALF) > -1;

    if (!hasControls && !hasAntiControls && !hasSwaps) {
        return;
    }

    var minIndex;
    var maxIndex;
    for (var i = 0; i < gateColumn.gates.length; i++) {
        if (gateColumn.gates[gateColumn.gates.length - 1 - i] !== null) {
            minIndex = gateColumn.gates.length - 1 - i;
        }
        if (gateColumn.gates[i] !== null) {
            maxIndex = i;
        }
    }
    var x = this.opRect(columnIndex).center().x;
    painter.strokeLine(
        {x: x, y: this.wireRect(minIndex).center().y},
        {x: x, y: this.wireRect(maxIndex).center().y});
};

/**
 * @param {?{ col : !number, row : !number, isInsert : !boolean }} modificationPoint
 * @param {!Hand} hand
 * @returns {!Circuit}
 */
Circuit.prototype.withOpBeingAdded = function(modificationPoint, hand) {
    if (modificationPoint === null || hand.heldGateBlock === null) {
        return this;
    }

    var newCols = this.columns.map(function(e) { return e; });
    var compressedColumnIndex = null;
    if (modificationPoint.isInsert) {
        insertAt(newCols, GateColumn.empty(this.numWires), modificationPoint.col);
        compressedColumnIndex = modificationPoint.col;
    }

    while (newCols.length < modificationPoint.col) {
        newCols.push(GateColumn.empty(this.numWires));
    }

    newCols[modificationPoint.col] =
        newCols[modificationPoint.col].withOpBeingAdded(modificationPoint.row, hand);

    return new Circuit(
        this.area,
        this.numWires,
        newCols,
        compressedColumnIndex);
};

Circuit.prototype.withoutEmpties = function() {
    return new Circuit(
        this.area,
        this.numWires,
        this.columns.filter(function (e) { return !e.isEmpty();}),
        this.compressedColumnIndex);
};

/**
 * @param {!Hand} hand
 * @returns {!{newCircuit: !Circuit, newHand: !Hand}}
 */
Circuit.prototype.tryGrab = function(hand) {
    if (hand.pos === null) {
        return {newCircuit: this, newHand: hand};
    }
    var co = this.findExistingOpColumnAt(hand.pos);
    if (co === null) {
        return {newCircuit: this, newHand: hand};
    }
    var c = notNull(co);
    var r = notNull(this.findWireAt(hand.pos));
    if (!this.gateRect(r, c).containsPoint(hand.pos) || this.columns[c].gates[r] === null) {
        return {newCircuit: this, newHand: hand};
    }

    var newCol = this.columns[c].gates.map(function(e) { return e; });
    var gate = notNull(newCol[r]);
    newCol[r] = null;
    var newGateBlock = [gate];

    var remainingSwap = newCol.indexOf(Gate.SWAP_HALF);
    //var isAnchor = gate.isAnchor() &&
    //    newCol.filter(function (e) { return e !== null && e.isAnchor(); }).length === 1;

    if (gate === Gate.SWAP_HALF && remainingSwap !== -1) {
        newCol[remainingSwap] = null;
        while (newGateBlock.length < Math.abs(remainingSwap - r)) {
            newGateBlock.push(null);
        }
        newGateBlock.push(Gate.SWAP_HALF);
    }

    return {
        newCircuit: new Circuit(
            this.area,
            this.numWires,
            withItemReplacedAt(this.columns, newCol, c),
            null),
        newHand: hand.withHeldGate(new GateBlock(newGateBlock), 0)
    };
};

Circuit.prototype.hasTimeBasedGates = function () {
    return !this.columns.every(function (e) {
        return e.gates.every(function(g) {
            return !g.isTimeBased();
        });
    });
};