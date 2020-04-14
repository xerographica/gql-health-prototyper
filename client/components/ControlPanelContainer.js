import React from 'react';
import LoadServer from './LoadServer';
import SubmitQuery from './SubmitQuery';

function ControlPanelContainer(props) {
  return (
      <div id="control-panel-container">
         <LoadServer
          onChange={props.onChange}
          onSubmitEndpoint={props.onSubmitEndpoint}
         />
         <SubmitQuery
          onChangeQuery={props.onChangeQuery}
          onSubmitQuery={props.onSubmitQuery}
          query={props.query}
          schema={props.schema}
         />
      </div>
  );
}

export default ControlPanelContainer;