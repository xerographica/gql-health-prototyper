import React from 'react';
import * as d3 from 'd3';
import { message } from 'antd';
import TraceDisplay from '../components/TraceDisplay';
import ControlPanelContainer from './ControlPanelContainer';
import VisualizerContainer from './VisualizerContainer';
import Header from './Header';
import drawNetworkGraph from '../utilities/drawNetworkGraph';
import SettingsBar from '../components/SettingsBar';
import { drawTracerGraph, convertTraceData } from '../utilities/drawTracerGraph';
import { highlightQuery } from '../utilities/highlighterFunction.js';
import { getIntrospectionQuery } from 'graphql';

class MainApp extends React.Component {
  constructor() {
    super();
    this.state = {
      endpoint: '', // user's GraphQL endpoint
      query: '', // user's query string
      selectedQuery: '',
      querydata: {}, // query results retrieved from server
      queryError: null,
      schema: {}, // introspected schema
      d3introspectdata: {}, // d3 file for introspected schema
      d3querydata: {}, // d3 info for query data
      showResults: false,
      querySaves: [],
    };
    this.onChange = this.onChange.bind(this);
    this.onSubmitEndpoint = this.onSubmitEndpoint.bind(this);
    this.onChangeQuery = this.onChangeQuery.bind(this);
    this.onSubmitQuery = this.onSubmitQuery.bind(this);
    this.postQuery = this.postQuery.bind(this);
    this.handleShowResults = this.handleShowResults.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleSaveQuery = this.handleSaveQuery.bind(this);
    this.handleSelectSave = this.handleSelectSave.bind(this);
    this.globalPopupError = this.globalPopupError.bind(this);
  }

  // loads in with previous state when refreshing browser
  componentDidMount() {
    this.loadWithLocalStorage()
      .then(() => {
        document.getElementById('endpoint').value = JSON.parse(localStorage.getItem('endpoint'));
        if (JSON.stringify(this.state.d3introspectdata) !== '{}') {
          drawNetworkGraph(this.state.d3introspectdata);
          if (JSON.stringify(this.state.querydata) !== '{}' && this.state.querydata.extensions) {
            const converted = convertTraceData(this.state.querydata);
            d3.select('#svg-trace').remove();
            drawTracerGraph(converted);
          }
        }
      });
    // checks if user logged in and will populate state with 
    if (this.props.user) {
      fetch('/api/gethistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: this.props.user }),
      })
        .then(res => res.json())
        .then(data => {
          this.setState({ querySaves: data });
        })
        .catch(err => console.log(err));
    }
    // event listener for leaving / refreshing the page -  saves state to local storage when
    window.addEventListener(
      'beforeunload',
      this.saveStateToLocalStorage.bind(this),
    );
  }

  componentWillUnmount() {
    window.removeEventListener(
      'beforeunload',
      this.saveStateToLocalStorage.bind(this),
    );
    // saves to local storage if component unmounts
    this.saveStateToLocalStorage();
  }

  saveStateToLocalStorage() {
    /* eslint-disable */
    for (let key in this.state) {
      if (key !== "querySaves") {
        localStorage.setItem(key, JSON.stringify(this.state[key]));
      }
    }
  };

    // handles pop up error messeges
  globalPopupError(type) {
    const success = () => message.success('Server successfully connected');
    const error = () => message.error('Server cannot be reached');
    const warning = () => message.warning('Query successful but tracing data not found');
    const warnSigninSave = () => message.warning('You must be signed in to save a query');
    const warnSigninHistroy = () => message.warning('You must be signed in to use history');
    if (type === 'success') success()
    if (type === 'error') error()
    if (type === 'warning') warning()
    if (type === 'signin-save') warnSigninSave()
    if (type === 'signin-history') warnSigninHistroy()
  }

  async loadWithLocalStorage() {
    for (let key in this.state) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage.getItem(key);
        try {
          this.setState({[key]: JSON.parse(value)});
        } catch (err) {
          // if can't parse an empty ''
          this.setState( {[key]: value})
        }
      }
    }
  }

  // onchange handler for endpoint input
  onChange(e) {
    this.setState({ [e.target.name]: e.target.value });
  }

  // onChange handler for CodeMirror
  onChangeQuery(text) {
    this.setState({ query: text });
  }

  handleShowResults() {
    if(!this.state.showResults) this.setState({ showResults: true });
    else this.setState({ showResults: false });
    console.log('check', this.state);
  }

  handleReset() {
    /* eslint-disable */
    const defaultState = {
      // endpoint: '', 
      endpointError: null, 
      // query: '', 
      querydata: {}, 
      queryError: null,
      schema: {}, 
      d3introspectdata: {}, 
      d3querydata: {}, 
      showResults: false,
    };
    d3.select('#svg-network').remove();
    d3.select('#svg-trace').remove();
    this.setState(defaultState);
  }

  handleSaveQuery() {
    const { querySaves } = this.state;
    const tpmUser = 'Chevin' // temporariy user because user does not persist with refresh
      if (this.props.user) {
      const queryName = this.state.query.split('\n')[1];
      fetch('/api/savequery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json'},
        body: JSON.stringify({ user: this.props.user, queryName, queryStr: this.state.query})
      })
        .then(res => res.json())
        .then(data => {
          const addObj = querySaves.concat(data);
          this.setState({ querySaves: addObj });
          console.log(addObj);  
        })
        .catch((err) => console.log(err));
    } else {
      this.globalPopupError('signin-save')
    }
  }

  // set query in state to selected save
  handleSelectSave(value) {
    console.log(value)
    this.setState({ selectedQuery: value })
  }

 onSubmitEndpoint(e) {
    e.preventDefault();
    // clears previous query and query results from state
    this.setState({ querydata: {} });
    d3.select('#svg-trace').remove();

    fetch(this.state.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({"query": getIntrospectionQuery()})
    }).then((res) => res.json())
      .then((data) => {
        fetch('/api/convertschema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceSchema: data.data }),
        })
          .then((res) => res.json())
          .then((data) => {
            // set state, delete previous svg and draw new svg passing in data
            this.setState({ schema: data.schema, d3introspectdata: data.d3json });
            this.globalPopupError('success')
            d3.select('#svg-network').remove();
            drawNetworkGraph(this.state.d3introspectdata);
          })
        }).catch((err) => {
          this.globalPopupError('error')
        })
  }

  // sends query to client's GraphQL endpoint and saves the query result in state
  async postQuery() {
    try {
      const response = await fetch(this.state.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({"query": this.state.query }),
      });
      const querydata = await response.json();
      this.setState({ querydata, queryError: null });
      if (this.state.querydata.extensions) {
        const converted = convertTraceData(querydata);
        d3.select('#svg-trace').remove();
        drawTracerGraph(converted);
      }
    } catch (err) {
      this.setState({ querydata: err, queryError: true });

    }
  }

  // takes GraphQL query result from state and fetches /getquery endpoint to update D3 visualization
  async updateD3WithQuery() {
    try {
      const response = await fetch('/api/getquery', {
        method: "Post",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.state.querydata),
      });
      const d3querydata = await response.json();
      if (d3querydata !== 'tracingerror') {
        this.setState({ d3querydata });
        const schemaCopy = this.state.d3introspectdata;
        const queryPath = d3querydata;
        const queryData = this.state.querydata;
        const highlightedSchema = highlightQuery(schemaCopy, queryPath, queryData);
        this.setState({ d3introspectdata: highlightedSchema });
        d3.select('#svg-network').remove();
        drawNetworkGraph(this.state.d3introspectdata);
        this.setState({ showResults: true});
      } else {
        // throw global warning error
        this.globalPopupError('warning')
      }
    } catch (err) {
      console.log(err);
    }
  }

  onSubmitQuery(e) {
    e.preventDefault();
    const resetSchema = this.state.d3introspectdata;
    resetSchema.links.forEach((element) => {
      element.source.highlighted = false;
      element.target.highlighted = false;
      element.target.parent = null; 
    });
    this.postQuery().then(() => {
      if (!this.state.queryError) this.updateD3WithQuery();
    });
    console.log(this.state);
  }

  render() {
    return (
      <div>
        <Header
          onChange={this.onChange}
          onSubmitEndpoint={this.onSubmitEndpoint}
          endpoint = {this.state.endpoint}
          isAuthed = {this.props.isAuthed}
          logout = {this.props.logout}
          user = {this.props.user}
        />
        <div id='flex-wrapper-1'>
          <ControlPanelContainer
            onChange={this.onChange}
            onSubmitQuery={this.onSubmitQuery}
            onChangeQuery={this.onChangeQuery}
            handleSaveQuery={this.handleSaveQuery}
            query={this.state.query}
            selectedQuery={this.state.selectedQuery}
            queryError={this.state.queryError}
            schema={this.state.schema}
            result={this.state.querydata}
            reset={this.state.resetStatus}
          />
          <div id="flex-wrapper-2">
            <SettingsBar 
              handleShowResults={this.handleShowResults}
              handleSelectSave={this.handleSelectSave}
              globalPopupError={this.globalPopupError}
              showResults={this.state.showResults} 
              handleReset = {this.handleReset}
              querySaves={this.state.querySaves}
              user={this.props.user}
            />
            <VisualizerContainer
              d3introspectdata={ this.state.d3introspectdata }
              result={ this.state.querydata}
              showResults={ this.state.showResults }
            />
            <TraceDisplay />
          </div>
        </div>
      </div>
    );
  }
}

export default MainApp;
