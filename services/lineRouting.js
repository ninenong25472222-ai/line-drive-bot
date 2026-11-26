const TEST_SOURCE_GROUP_ID = "C04cfcf9eeeae0b36bd8d22122d252928";

function cleanGroupId(value = "") {
    return String(value || "").trim();
}

function getEventGroupId(event) {
    return cleanGroupId(event?.source?.groupId);
}

function getAllowedSourceGroupIds(sourceGroupIds, { includeLegacyTestGroup = true } = {}) {
    const configuredGroupIds = (Array.isArray(sourceGroupIds)
        ? sourceGroupIds
        : String(sourceGroupIds || "").split(/[\s,;]+/))
        .map(cleanGroupId)
        .filter(Boolean);

    if (!configuredGroupIds.length) {
        return [];
    }

    return [...new Set([
        ...configuredGroupIds,
        ...(includeLegacyTestGroup ? [TEST_SOURCE_GROUP_ID] : [])
    ])];
}

function isAllowedSourceGroup(event, sourceGroupIds, options) {
    const allowedGroupIds = getAllowedSourceGroupIds(sourceGroupIds, options);

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
