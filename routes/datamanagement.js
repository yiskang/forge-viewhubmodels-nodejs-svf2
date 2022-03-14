const express = require('express');
const { HubsApi, ProjectsApi, FoldersApi, ItemsApi, VersionsApi, DerivativesApi } = require('forge-apis');

const { OAuth } = require('./common/oauth');

let router = express.Router();

router.get('/datamanagement', async (req, res) => {
    // The id querystring parameter contains what was selected on the UI tree, make sure it's valid
    const href = decodeURIComponent(req.query.id);
    if (href === '') {
        res.status(500).end();
        return;
    }

    // Get the access token
    const oauth = new OAuth(req.session);
    const internalToken = await oauth.getInternalToken();
    if (href === '#') {
        // If href is '#', it's the root tree node
        getHubs(oauth.getClient(), internalToken, res);
    } else {
        // Otherwise let's break it by '/'
        const params = href.split('/');

        let resourceName = ''
        let resourceId = ''
        if (params.length > 1) {
            resourceName = params[params.length - 2];
            resourceId = params[params.length - 1];
        } else {
            resourceName = 'views'
        }

        switch (resourceName) {
            case 'hubs':
                getProjects(resourceId, oauth.getClient(), internalToken, res);
                break;
            case 'projects':
                // For a project, first we need the top/root folder
                const hubId = params[params.length - 3];
                getFolders(hubId, resourceId/*project_id*/, oauth.getClient(), internalToken, res);
                break;
            case 'folders':
                {
                    const projectId = params[params.length - 3];
                    getFolderContents(projectId, resourceId/*folder_id*/, oauth.getClient(), internalToken, res);
                    break;
                }
            case 'items': //this can be an item in non-Plan folder and can also be a bim360 document in Plan folder
                {
                    const projectId = params[params.length - 3];
                    getVersions(projectId, resourceId/*item_id*/, oauth.getClient(), internalToken, res);
                    break;
                }
            case 'views':
                {
                    getVersionViews(href,/*urn_id*/ oauth.getClient(), internalToken, res);
                    break;
                }
        }
    }
});

router.get('/datamanagement/projects/:projectId/folders/:folderId/parent', async (req, res, next) => {
    try {
        // Get the access token
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();

        getFolderParent(req.params.projectId, req.params.folderId, oauth.getClient(), internalToken, res);
    } catch (err) {
        next(err);
    }
});

router.get('/datamanagement/projects/:projectId/items/:itemId/parent', async (req, res, next) => {
    try {
        // Get the access token
        const oauth = new OAuth(req.session);
        const internalToken = await oauth.getInternalToken();

        getItemFolderParent(req.params.projectId, req.params.itemId, oauth.getClient(), internalToken, res);
    } catch (err) {
        next(err);
    }
});

async function getHubs(oauthClient, credentials, res) {
    const hubs = new HubsApi();
    const data = await hubs.getHubs({}, oauthClient, credentials);
    res.json(data.body.data.map((hub) => {
        let hubType;
        switch (hub.attributes.extension.type) {
            case 'hubs:autodesk.core:Hub':
                hubType = 'hubs';
                break;
            case 'hubs:autodesk.a360:PersonalHub':
                hubType = 'personalHub';
                break;
            case 'hubs:autodesk.bim360:Account':
                hubType = 'bim360Hubs';
                break;
        }
        return createTreeNode(
            hub.links.self.href,
            hub.attributes.name,
            hubType,
            true
        );
    }));
}

async function getProjects(hubId, oauthClient, credentials, res) {
    const projects = new ProjectsApi();
    const data = await projects.getHubProjects(hubId, {}, oauthClient, credentials);
    res.json(data.body.data.map((project) => {
        let projectType = 'projects';
        switch (project.attributes.extension.type) {
            case 'projects:autodesk.core:Project':
                projectType = 'a360projects';
                break;
            case 'projects:autodesk.bim360:Project':
                projectType = 'bim360projects';
                break;
        }
        return createTreeNode(
            project.links.self.href,
            project.attributes.name,
            projectType,
            true
        );
    }));
}

async function getFolders(hubId, projectId, oauthClient, credentials, res) {
    const projects = new ProjectsApi();
    const folders = await projects.getProjectTopFolders(hubId, projectId, oauthClient, credentials);
    res.json(folders.body.data.map((item) => {
        return createTreeNode(
            item.links.self.href,
            item.attributes.displayName == null ? item.attributes.name : item.attributes.displayName,
            item.type,
            true
        );
    }));
}

async function getFolderContents(projectId, folderId, oauthClient, credentials, res) {
    const folders = new FoldersApi();
    const contents = await folders.getFolderContents(projectId, folderId, {}, oauthClient, credentials);
    const treeNodes = contents.body.data.map((item) => {
        var name = (item.attributes.name == null ? item.attributes.displayName : item.attributes.name);
        if (name !== '') {
            return createTreeNode(
                item.links.self.href,
                name,
                item.type,
                true
            );
        } else {
            return null;
        }
    });
    res.json(treeNodes.filter(node => node !== null));
}

async function getFolderParent(projectId, folderId, oauthClient, credentials, res) {
    try {
        const folders = new FoldersApi();
        const contents = await folders.getFolderParent(projectId, folderId, oauthClient, credentials);
        const parentFolder = contents.body.data;
        const node = createTreeNode(
            parentFolder.links.self.href,
            (parentFolder.attributes.name == null ? parentFolder.attributes.displayName : parentFolder.attributes.name),
            parentFolder.type,
            true
        );
        res.json(node);
    } catch(ex) {
        res.status(500).json(ex);
    }
}

async function getItemFolderParent(projectId, itemId, oauthClient, credentials, res) {
    const items = new ItemsApi();
    const contents = await items.getItemParentFolder(projectId, itemId, oauthClient, credentials);
    const parentFolder = contents.body.data;
    const node = createTreeNode(
        parentFolder.links.self.href,
        (parentFolder.attributes.name == null ? parentFolder.attributes.displayName : parentFolder.attributes.name),
        parentFolder.type,
        true
    );
    res.json(node);
}

async function getVersions(projectId, itemId, oauthClient, credentials, res) {
    const items = new ItemsApi();
    const versions = await items.getItemVersions(projectId, itemId, {}, oauthClient, credentials);

    const version_promises = versions.body.data.map(async (version) => {
        const dateFormated = new Date(version.attributes.lastModifiedTime).toLocaleString();
        const versionst = version.id.match(/^(.*)\?version=(\d+)$/)[2];
        if (version.attributes.extension.data && version.attributes.extension.data.viewableGuid) {

            //this might be the documents in BIM 360 Plan folder. It is view (derivative)already.
            const viewableGuid = version.attributes.extension.data.viewableGuid
            //NOTE: version.id is the urn of view version, instead of the [seed file version urn]
            //tricky to find [seed file version urn]
            //var viewerUrn = Buffer.from(params[0]).toString('base64') + '_' + Buffer.from(params[1]).toString('base64')

            const seedVersionUrn = await getVersionRef(projectId, version.id, oauthClient, credentials)
            const viewerUrn = seedVersionUrn ? Buffer.from(seedVersionUrn).toString('base64').replace('/', '_').trim('=').split('=').join('') : null

            const seedVersionStorage = await getVersionRefStorage(projectId, version.id, oauthClient, credentials);
            // let's return for the jsTree with a special id:
            // itemUrn|versionUrn|viewableId
            // itemUrn: used as target_urn to get document issues
            // versionUrn: used to launch the Viewer
            // viewableId: which viewable should be loaded on the Viewer
            // this information will be extracted when the user click on the tree node
            return createTreeNode(
                itemId + '|' + viewerUrn + '|' + viewableGuid,
                decodeURI('v' + versionst + ': ' + dateFormated + ' by ' + version.attributes.lastModifiedUserName),
                (viewerUrn != null ? 'versions' : 'unsupported'),
                false
            );
        } else {
            //non-BIM 360 Plan folder (also Autodesk 360, Fusion 360 etc). will need to dump views in the next iteration 
            const viewerUrn = (version.relationships != null && version.relationships.derivatives != null ? version.relationships.derivatives.data.id : null);
            return createTreeNode(
                viewerUrn,
                decodeURI('v' + versionst + ': ' + dateFormated + ' by ' + version.attributes.lastModifiedUserName),
                viewerUrn ? 'versions' : 'unsupported',
                true
            );
        }
    })
    const versions_json = await Promise.all(version_promises);
    res.json(versions_json);
}

async function getVersionRefStorage(projectId, viewUrnId, oauthClient, credentials) {
    const versionApi = new VersionsApi()
    const relationshipRefs = await versionApi.getVersionRelationshipsRefs(projectId, viewUrnId, {}, oauthClient, credentials)

    if (relationshipRefs.body && relationshipRefs.body.included && relationshipRefs.body.included.length > 0) {
        //find file of the reference
        const ref = relationshipRefs.body.included.find(d => d &&
            d.type == 'versions' &&
            d.attributes.extension.type == 'versions:autodesk.bim360:File')

        if (ref) {
            return ref.relationships.storage.data.id;
        } else {
            return null;
        }
    }

    return null;
}

// get references of this version urn,e.g. views of seed file
async function getVersionRef(projectId, viewUrnId, oauthClient, credentials) {
    // Documents in BIM 360 Folder will go to this branch
    const versionApi = new VersionsApi()
    const relationshipRefs = await versionApi.getVersionRelationshipsRefs(projectId, viewUrnId, {}, oauthClient, credentials)

    if (relationshipRefs.body && relationshipRefs.body.data && relationshipRefs.body.data.length > 0) {
        //find meta of the reference
        const ref = relationshipRefs.body.data.find(d => d.meta &&
            d.meta.fromType == 'versions' &&
            d.meta.toType == 'versions')
        if (ref) {
            if (ref.meta.extension.type == 'derived:autodesk.bim360:CopyDocument') {
                //this is a copy document, ref.id is the view urn, instead of version urn
                //recurse until find the source version urn
                const sourceViewId = ref.id
                return await getVersionRef(projectId, sourceViewId, oauthClient, credentials)
            } else if (ref.meta.extension.type == 'derived:autodesk.bim360:FileToDocument') {
                //this is the original documents, when source model version is extracted in BIM 360 Plan folder
                return ref.id
            } else {
                return null
            }
        } else {
            return null
        }
    } else {
        return null
    }
}


async function getVersionViews(urn, oauthClient, credentials, res) {

    const region = Buffer.from(urn, 'base64').toString('ascii').indexOf('emea') > -1 ? 'EU' : 'US';
    const derivativesApi = new DerivativesApi(null, region);

    //get manifest of this model version 
    const manifest = await derivativesApi.getManifest(urn, {}, oauthClient, credentials)
    //find the derivative of svf
    const geo_derivatives = manifest.body.derivatives.find(d => d.outputType == 'svf')

    //get metadata of this model version
    const metadata = await derivativesApi.getMetadata(urn, {}, oauthClient, credentials);

    //dump each metadata
    const view_promises = metadata.body.data.metadata.map(async (view) => {

        //view.guid is the metadata id, now find the corresponding real vieweable id 

        //search which [geometry derivative] whose [graphics] child has the same metadata id 
        const metadata_graphics = geo_derivatives.children.find(d => d.type == 'geometry' &&
            d.children.find(r => r.guid == view.guid) != null)

        return createTreeNode(
            urn + '|' + (metadata_graphics ? metadata_graphics.guid : 'none'),
            view.name,
            metadata_graphics ? 'views' : 'unsupported',
            false
        );
    });

    //promise the iteration
    const views_json = await Promise.all(view_promises);
    res.json(views_json)
}

// Format data for tree
function createTreeNode(_id, _text, _type, _children) {
    return { id: _id, text: _text, type: _type, children: _children };
}

module.exports = router;