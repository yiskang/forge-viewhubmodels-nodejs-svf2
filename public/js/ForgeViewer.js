/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

var viewer;

// @urn the model to show
// @viewablesId which viewables to show, applies to BIM 360 Plans folder
function launchViewer(urn, viewableId) {
  var options = {
    env: 'MD20Prod' + (atob(urn.replace('urn:', '').replace('_', '/')).indexOf('emea') > -1 ? 'EU' : 'US'),
    api: 'D3S',
    getAccessToken: getForgeToken
  };

  if (LMV_VIEWER_VERSION >= '7.48') {
    options.env = 'AutodeskProduction2';
    options.api = 'streamingV2' + (atob(urn.replace('urn:', '').replace('_', '/')).indexOf('emea') > -1 ? '_EU' : '');
  }

  Autodesk.Viewing.Initializer(options, () => {
    viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('forgeViewer'));
    viewer.start();
    var documentId = 'urn:' + urn;
    Autodesk.Viewing.Document.load(documentId, onDocumentLoadSuccess, onDocumentLoadFailure);
  });

  function onDocumentLoadSuccess(doc) {
    // if a viewableId was specified, load that view, otherwise the default view
    const root = doc.getRoot();
    const viewables = root.search({ 'type': 'geometry', 'role': '3d' });

    console.log('Viewables:', viewables);

    const phaseViews = viewables.filter(v => v.data.name === v.data.phaseNames && v.getViewableRootPath().includes('08f99ae5-b8be-4f8d-881b-128675723c10'));

    console.log('Master Views:', phaseViews);


    viewer.loadDocumentNode(doc, phaseViews[0], { skipHiddenFragments: false }).then(model => {
      // any additional action here?

      console.log({
        'is SVF2?': model.isSVF2(),
        'is OTG?': model.isOTG(),
        'LMV version': LMV_VIEWER_VERSION
      });
    });
  }

  function onDocumentLoadFailure(viewerErrorCode) {
    console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
  }
}

function getForgeToken(callback) {
  fetch('/api/forge/oauth/token').then(res => {
    res.json().then(data => {
      callback(data.access_token, data.expires_in);
    });
  });
}