const test = require("node:test");
const assert = require("node:assert/strict");

const {
    TEST_SOURCE_GROUP_ID,
    isAllowedSourceGroup,
    canSendToDestination
} = require("../services/lineRouting");
const { shouldQueueForDeletion } = require("../services/bookingLifecycleService");

const primaryGroupId = "C6a954d191660bcbeb24433dc8f24483d";
const eventFrom = (groupId) => ({ source: { type: "group", groupId } });

test("rejects every source group when SOURCE_GROUP_ID is absent", () => {
    assert.equal(isAllowedSourceGroup(eventFrom(primaryGroupId), ""), false);
    assert.equal(isAllowedSourceGroup(eventFrom(TEST_SOURCE_GROUP_ID), ""), false);
});

test("accepts only the configured production and approved test source groups", () => {
    assert.equal(isAllowedSourceGroup(eventFrom(primaryGroupId), primaryGroupId), true);
    assert.equal(isAllowedSourceGroup(eventFrom(TEST_SOURCE_GROUP_ID), primaryGroupId), true);
    assert.equal(isAllowedSourceGroup(eventFrom("Cother"), primaryGroupId), false);
});

test("only allows a distinct configured destination group", () => {
    assert.equal(canSendToDestination(eventFrom(primaryGroupId), "Cdestination"), true);
    assert.equal(canSendToDestination(eventFrom(primaryGroupId), primaryGroupId), false);
    assert.equal(canSendToDestination(eventFrom(primaryGroupId), ""), false);
});

test("queues only cancelled, incorrect, or two-day-expired bookings", () => {
    assert.equal(shouldQueueForDeletion({ status: "ยกเลิก" }, "2026-10-24"), true);
    assert.equal(shouldQueueForDeletion({ return_date: "2026-10-24" }, "2026-10-24"), true);
    assert.equal(shouldQueueForDeletion({ return_date: "2026-10-25" }, "2026-10-24"), false);
    assert.equal(shouldQueueForDeletion({ status: "ผิดพลาด", deletion_status: "pending_confirmation" }, "2026-10-24"), false);
});
