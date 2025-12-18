import yaml
import os
import glob

def get_fac_config(scope_path=None):
    """Parse fac.yaml file(s) to get configuration"""
    if scope_path:
        fac_file = os.path.join(scope_path, 'fac.yaml')
        if os.path.exists(fac_file):
            with open(fac_file, 'r') as f:
                return yaml.safe_load(f)
    else:
        # Look for fac.yaml in current directory
        if os.path.exists('fac.yaml'):
            with open('fac.yaml', 'r') as f:
                return yaml.safe_load(f)
    return {}

def get_available_scopes():
    """Get list of available scopes from static/scopes directory"""
    scopes_dir = os.path.join('static', 'scopes')
    if not os.path.exists(scopes_dir):
        return []
    
    scopes = []
    for item in os.listdir(scopes_dir):
        scope_path = os.path.join(scopes_dir, item)
        if os.path.isdir(scope_path):
            scopes.append(item)
    
    return scopes

def get_scope_targets(scope):
    """Get available targets for a scope from fac.yaml"""
    config = get_fac_config()
    targets = config.get('targets', {})
    
    # Filter targets that might be relevant to this scope
    # For now, return all targets - can be refined later
    return list(targets.keys())

