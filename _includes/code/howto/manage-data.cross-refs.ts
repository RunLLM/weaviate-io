import assert from 'assert';

// ================================
// ===== INSTANTIATION-COMMON =====
// ================================

import weaviate, {generateUuid5} from 'weaviate-client';

const client = await weaviate.connectToWCS(
  'WEAVIATE_INSTANCE_URL',  // Replace WEAVIATE_INSTANCE_URL with your instance URL
 {
   authCredentials: new weaviate.ApiKey('api-key'),
   headers: {
     'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY || '',  // Replace with your inference API key
   }
 } 
)

const sfId = '00ff6900-e64f-5d94-90db-c8cfa3fc851b';
const usCitiesId = '20ffc68d-986b-5e71-a680-228dba18d7ef';
const museumsId = 'fec50326-dfa1-53c9-90e8-63d0240bd933';

async function delProp(uuid: string, propName: string, className: string) {
  const objectData = await client.data.getterById().withId(uuid).withClassName(className).do();
  if (propName in objectData.properties)
    delete objectData.properties[propName];
  // Works even though "updater" semantics should only update the specified fields, and [propName] will be missing;
  // i.e. there's no client.data_object.replace equivalent in the TypeScript client. Waiting on response from Parker.
  // From https://weaviate-python-client.readthedocs.io/en/stable/weaviate.data.html#weaviate.data.DataObject.update:
  // "Overwrites only the specified fields, the unspecified ones remain unchanged." TODO rm
  await client.data.updater().withId(uuid).withClassName(className).withProperties(objectData.properties).do();
}

/* Use the Python example to load the data. Left this TS stub code here in case we want to show that part.
import jeopardy1k from './jeopardy_1k.json' assert { type: 'json' };

const categories = new Set(jeopardy1k.map(q => q.Category));

const jeopardyCategoryClass = {
  class: 'JeopardyCategory',
  description: 'A Jeopardy! category',
};
const jeopardyQuestionClass = {
  class: 'JeopardyQuestion',
  description: 'A Jeopardy! question',
  properties: [
    { name: 'question' , dataType: ['text'] },
    { name: 'answer', dataType: ['text'] },
    {
      name: 'hasCategory',
      dataType: ['JeopardyCategory'],
      description: 'The category of the question',
    },
  ],
  vectorizer: 'text2vec-openai',
};

await client
  .schema
  .classCreator()
  .withClass(jeopardyCategoryClass)
  .withClass(jeopardyQuestionClass)
  .do();

// Import the categories

// Import the questions
*/


// =================================
// ===== ObjectWithCrossRef =====
// =================================

let response;
const obj_uuid = 'f7344d30-7fe4-54dd-a233-fcccd4379d5c'

// Delete the object if it exists
try {
  await client.data.deleter().withId(obj_uuid).do();
} catch (e) {
  console.log('Object not found, skipping deletion.');
}

// ObjectWithCrossRef
const myCollection = client.collections.get('JeopardyCategory')
const properties = {"name": "Science"}
const uuid = generateUuid5(myCollection.name, properties.name)
const categoryId = '...'

const response = await myCollection.data.insert({
  properties: properties,
  id: uuid, // A UUID for the object
  // highlight-start
  references: {
    'hasCategory': categoryId  // e.g. {'hasCategory': '583876f3-e293-5b5b-9839-03f455f14575'}
  }
   // highlight-end
})

console.log('UUID: ', response)
// END ObjectWithCrossRef

// Test
let q_obj = await client.data.getterById().withClassName('JeopardyQuestion').withId(obj_uuid).do();
assert.equal(q_obj.class, 'JeopardyQuestion');
assert((q_obj.properties['hasCategory'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyCategory/583876f3-e293-5b5b-9839-03f455f14575`));
// End test


// =================================
// ===== Add one-way cross-ref =====
// =================================

// OneWay TS
const myCollection = client.collections.get('JeopardyCategory')
const categoryObjectId = '...'
const questionObjectId = '...'

await myCollection.data.referenceAdd({
  fromProperty: 'hasCategory',
  to: categoryObjectId,
  fromUuid: questionObjectId
})
// END OneWay TS

// Test
let sf = await client.data.getterById().withClassName('JeopardyQuestion').withId(sfId).do();
assert.equal(sf.class, 'JeopardyQuestion');
assert((sf.properties['hasCategory'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyCategory/${usCitiesId}`));
// End test


// =======================================
// ===== Add bidirectional cross-ref =====
// =======================================

// Delete any existing cross-references from the source and target objects
await delProp(sfId, 'hasCategory', 'JeopardyQuestion');
await delProp(usCitiesId, 'hasQuestion', 'JeopardyCategory');


// START Collections TwoWay Category1
const category = client.collections.create({
  name: "JeopardyCategory",
  description: "A Jeopardy! category",
  properties: [
    {
      name: "title",
      dataType: "text"
    }
  ]
})
// END Collections TwoWay Category1

// START Collections TwoWay Question
const jeopardyQuestionCollection = client.collections.create({
  name: 'JeopardyQuestion',
  properties: [
        { name: 'question' , dataType: 'text' },
        { name: 'answer', dataType: 'text' }
      ],
  references: [{
    name: 'hasCategory',
    targetCollection: 'JeopardyCategory'
  }]
})
// END Collections TwoWay Question

// START Collections TwoWay Category2
// Add the "hasQuestion" cross-reference property to the JeopardyCategory collection
const myCollection = client.collections.get('JeopardyCategory')

await myCollection.config.addReference({
  name: 'hasQuestion',
  targetCollection: 'JeopardyQuestion'
})
// END Collections TwoWay Category2


// TwoWay TS
// For the "San Francisco" JeopardyQuestion object, add a cross-reference to the "U.S. CITIES" JeopardyCategory object
const questions = client.collections.get("JeopardyQuestion")
let questionObjectId = ''
let catogoryObjectId = ''

await questions.data.referenceAdd({
    fromUuid: questionObjectId,
    fromProperty: 'hasCategory',
    to: catogoryObjectId
})

// For the "U.S. CITIES" JeopardyCategory object, add a cross-reference to "San Francisco"
const category = client.collections.get("JeopardyCategory")

await category.data.referenceAdd({
    fromUuid: catogoryObjectId,
    fromProperty: 'hasQuestion',
    to: questionObjectId
})
// END TwoWay TS

// Test
sf = await client.data.getterById().withClassName('JeopardyQuestion').withId(sfId).do();
const usCities = await client.data.getterById().withClassName('JeopardyCategory').withId(usCitiesId).do();
assert.equal(sf.class, 'JeopardyQuestion');
assert.equal(usCities.class, 'JeopardyCategory');
assert((sf.properties['hasCategory'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyCategory/${usCitiesId}`));
assert((usCities.properties['hasQuestion'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyQuestion/${sfId}`));
// End test


// ===================================
// ===== Add multiple cross-refs =====
// ===================================

// Delete any existing cross-references from the source object
await delProp(sfId, 'hasCategory', 'JeopardyQuestion');

// Multiple TS
// This example will be published soon
// END Multiple TS

// Test
sf = await client.data.getterById().withClassName('JeopardyQuestion').withId(sfId).do();
assert.equal(sf.class, 'JeopardyQuestion');
// .withConsistencyLevel('ALL') above prevents test flakiness
assert((sf.properties['hasCategory'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyCategory/${usCitiesId}`));
assert((sf.properties['hasCategory'] as object[]).find(xref => xref['href'] === `/v1/objects/JeopardyCategory/${museumsId}`));
// End test

// =============================
// ===== Delete cross-refs =====
// =============================

// Delete TS
// From the "San Francisco" JeopardyQuestion object, delete the "MUSEUMS" category cross-reference
const questions = client.collections.get("JeopardyQuestion")
let questionObjectId = ''
let catogoryObjectId = ''


await questions.data.referenceDelete({
  fromUuid: questionObjectId,
  fromProperty: 'hasCategory',
  to: catogoryObjectId
})

// END Delete TS

// Test
sf = await client.data.getterById().withClassName('JeopardyQuestion').withId(sfId).do();
console.log(JSON.stringify(sf, null, 2));
assert.equal(sf.class, 'JeopardyQuestion');
assert.deepEqual(sf.properties['hasCategory'], [{
  beacon: `weaviate://localhost/JeopardyCategory/${usCitiesId}`,
  href: `/v1/objects/JeopardyCategory/${usCitiesId}`,
}]);
// End test

// =============================
// ===== Update cross-refs =====
// =============================

// Update TS
// In the "San Francisco" JeopardyQuestion object, set the "hasCategory" cross-reference only to "MUSEUMS"
const questions = client.collections.get("JeopardyQuestion")
let questionObjectId = ''
let catogoryObjectId = ''


await questions.data.referenceReplace({
  fromUuid: questionObjectId,
  fromProperty: 'hasCategory',
  to: catogoryObjectId
})
// END Update TS

// Test
sf = await client.data.getterById().withClassName('JeopardyQuestion').withId(sfId).do();
console.log(JSON.stringify(sf, null, 2));
assert.equal(sf.class, 'JeopardyQuestion');
assert.deepEqual(sf.properties['hasCategory'], [{
  beacon: `weaviate://localhost/JeopardyCategory/${museumsId}`,
  href: `/v1/objects/JeopardyCategory/${museumsId}`,
}]);
// End test
