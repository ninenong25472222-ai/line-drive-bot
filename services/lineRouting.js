const TEST_SOURCE_GROUP_ID = "C04cfcf9eeeae0b36bd8d22122d252928";

function cleanGroupId(value = "") {
    return String(value || "").trim();
}

function getEventGroupId(event) {
    return cleanGroupId(event?.source?.groupId);
}

function getAllowedSourceGroupIds(sourceGroupId) {
    const primaryGroupId = cleanGroupId(sourceGroupId);

    // Fail closed: a deployment without its primary source group configured
    // must not accept events from the test group (or from any other group).
    if (!primaryGroupId) {
        return [];
    }

    return [
        primaryGroupId,
        TEST_SOURCE_GROUP_ID
    ];
}

function isAllowedSourceGroup(event, sourceGroupId) {
    const allowedGroupIds =
        getAllowedSourceGroupIds(sourceGroupId);

    return allowedGroupIds.includes(
        getEventGroupId(event)
    );
}

function canSendToDestination(event, destinationGroupId) {
    const destination = cleanGroupId(destinationGroupId);
    const source = getEventGroupId(event);

    return Boolean(destination && source && destination !== source);
}

module.exports = {
    TEST_SOURCE_GROUP_ID,
    getEventGroupId,
    getAllowedSourceGroupIds,
    isAllowedSourceGroup,
    canSendToDestination
};
